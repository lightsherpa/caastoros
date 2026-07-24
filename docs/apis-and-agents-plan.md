# CaastorOS — APIs + Agents implementation plan

_Status: PLAN. Consolidates the implementation path from `window.CI_*` mocks to one real brand running end-to-end. The current catalog has 55 L2 specialists: 49 non-motion/video specialists are in this completion scope, while the five `Motion & Sound` specialists and `a44 Style Frames` are explicitly deferred._

---

## 0. The target

One brand. Live. End-to-end.

```
URL → Discovery → BIO → Brief (+ clarify) → Brandolph routes
    → Live specialists run (strategy · concept · copy · visual · web · research)
    → QA gate → Outputs on the canvas → Credits reconciled
```

Every node on the brief board becomes backed by a real run row, with a real prompt, a real model call, a real artifact, a real cost, and a real QA verdict. The canvas already speaks this shape — once the data layer is real, the canvas does not change.

---

## 1. Architecture

The portal is a static Vite SPA. **No API keys ever ship to the browser.** The smallest viable production shape:

```
[ SPA · Vite/React ]   ←→   [ Edge API · Hono ]   ←→   [ Workers · Inngest ]
       (existing)              (new, thin)               (new, async jobs)
                                    ↓                       ↓
                            [ Postgres · Supabase ]    [ Vendor APIs ]
                            [ Storage · Supabase ]   Anthropic · OpenAI · fal
                            [ Auth · Supabase ]      Exa · Firecrawl · Stripe
```

- **Edge API** — Hono on Cloudflare/Vercel Edge. Sync endpoints, request validation, SSE. **No long-running model calls here** — only kickoff + stream-forward.
- **Workers** — Inngest (or Trigger.dev). Every specialist run, every discovery, every image gen is a durable job. Retries, idempotency, observability for free.
- **DB + Storage + Auth** — Supabase. One vendor for the boring layer means we ship faster.
- **Streaming** — SSE from the edge for text outputs (Anthropic supports it natively); polling for images. The canvas already tolerates `in-production` states.

**Why not a Node monolith?** Long-running specialist runs (3–30s) on a hot Node process tie up connections and create cold-start grief. Durable jobs keep the API edge fast, free up the canvas to stream, and survive vendor flakiness.

**Why not stay browser-only with BYO keys?** Workable for a developer demo, fatal for a brand-methodology product — every brand's BIO must be canonical and shareable, every specialist run must be auditable, credits must reconcile. That needs server state.

---

## 2. The Specialist Runtime (the kernel)

This is the heart of the product. Everything else is plumbing around it.

### 2.1 Invocation contract

Every L2 specialist run, regardless of department or model, is invoked the same way:

```ts
runSpecialist({
  specialistId,         // current catalog ids a01..a55
  brandId,              // → loads the canonical BIO at version pinned to the run
  briefId,              // → loads the sharpened brief + clarifications
  inputs?: { uploads, priorOutputIds, extraContext },
  workspaceId,          // for tenancy + credit ledger
  budget: { maxCredits, hardTimeoutMs },
}) → { runId, stream }
```

The runner does, in order:

1. **Load** brand, BIO (pinned version), brief, specialist record + spec.
2. **Compose** the four-layer system prompt (§2.2). Port `composeSpecialistPrompt()` (`src/portal-briefs.jsx:426`) verbatim — it's already correct.
3. **Route** to the model bound in the spec (`modelRouting.primary`, with `fallback`).
4. **Mark cacheable** the PLATFORM and BIO layers (Anthropic `cache_control: ephemeral`). These two layers repeat across every specialist call for a brand — cache hit rate should be >90% after warm-up.
5. **Call** the model with streaming on; persist a `runs` row as `running` before the first token.
6. **Stream-forward** tokens to the SSE channel; persist the final body + tool calls.
7. **QA gate**: dispatch a Haiku call (or local pre-check for forbidden words) to score against `CI_BRAND_REFUSALS` + per-specialist `refusals`. Write `qa_results`.
8. **Reconcile** credits from real token + image cost (§7) and append to `ledger`.
9. **Emit** `output` row with `status: approved | flagged`, `rationale` (extracted from structured output, not derived).

The runner is one function. It does not know what a Conversion Copywriter is — it just orchestrates these eight steps. Specialist behavior lives in the **spec data**, not in code.

### 2.2 Prompt assembly (already designed — make it real)

```
[ PLATFORM PREAMBLE ]     constant; defines what an L2 is, that Brandolph routed
[ BRAND CONTEXT · BIO ]   the BIO slice the dept needs (Copy ⇒ voice + forbidden,
                          Design ⇒ palette + type, Concept ⇒ positioning + audience)
[ SPECIALIST SPEC ]       role · objective · method · outputContract · refusals · voice
[ TASK CONTEXT ]          the sharpened brief + clarifications + prior outputs
```

`CI_DEPT_SPECS` holds seven per-department fallback templates. `CI_SPECIALIST_SPECS` holds bespoke per-specialist behavior. A department fallback can keep a prototype runnable, but it does not satisfy the completion gate for an in-scope specialist.

### 2.3 Catalog/spec completion gate

The source-of-truth catalog is 55 records across seven departments: Strategy 6, Concept 8, Copy 11, Visual 11, Web & UX 7, Motion & Sound 5, and Research & Ops 7. The catalog has 50 live records and five `soon` records; the current completion scope contains 49 specialists because `a44 Style Frames` is video preproduction despite living under Visual.

Before this milestone is called complete, every in-scope record, independent of status, must own a bespoke `CI_SPECIALIST_SPECS[id]` entry with non-empty `role`, `objective`, `method`, `outputContract`, `voice`, `refusals`, and `bioSlices`. Every bespoke id must also resolve to a catalog record. `server/src/lib/specialist-spec-coverage.test.mjs` enforces that contract directly against `src/portal-data.js`. Internal specialists (`a30`, `a33`) remain in scope.

Motion/video is explicitly outside this milestone. No provider integration, activation, renderer, or motion QA work is required for `a27`, `a28`, `a44`, `a50`, `a51`, or `a52`.

### 2.4 Structured output (kill the "rationale" derivation)

Every text specialist returns:

```json
{ "body": "...", "rationale": "...", "meta": { "voiceDriftEstimate": 0.12 } }
```

No more `outputRationale` derivation. Each output node on the canvas shows `body` as the artifact and `rationale` as the "why this." The drawer's "Reveal full prompt" shows the actual composed prompt (§2.2). This is the seam where the team-side prompt transparency stops being aspirational.

---

## 3. API surface

### 3.1 External vendors (the integration matrix)

| Stage | Vendor (primary / fallback) | Model | Used by | Cache | Notes |
|---|---|---|---|---|---|
| Text — L1 (judgment) | Anthropic / — | Opus | Brandolph and judgment-heavy Strategy/Concept/Copy specialists | yes, PLATFORM+BIO | Exact route comes from each catalog/spec row |
| Text — L2 (production) | Anthropic / OpenRouter | Sonnet / GPT-5 / Gemini | Live Strategy, Concept, Copy, Visual, Web & UX, Research & Ops text specialists | yes | Shared text runner; bespoke behavior lives in specs |
| Image | fal.run | GPT Image / Flux / Recraft | Live Visual specialists plus Iconography and Mood Board | n/a | One image interface with per-specialist routes |
| Vision (BIO extract) | Anthropic Claude (vision) | Sonnet | Discovery palette/type extraction | n/a | Screenshot in, structured palette+type out |
| Scrape | Firecrawl / Exa | — | a31 Site Scanner, Discovery | per-URL 24h | Clean markdown; Exa for "find competitors" |
| Search | Exa | — | a32 Competitor Map | per-query 24h | Semantic search w/ summaries |
| Web build | v0 platform API / Framer | — | a25, a26, a29 | n/a | Generates JSX/HTML for landing + email |
| Deck / motion / audio | Deferred | — | a27, a28, a44, a50, a51, a52 | n/a | Explicitly outside this completion scope |
| PDF parse | Mistral OCR / LlamaParse | — | BIO source uploads | 30d | When user feeds Brandolph a PDF |
| Color extract | node-vibrant (local) | — | Discovery palette fallback | n/a | Cheaper than vision for first pass |
| Auth + DB + Storage | Supabase | — | everything | n/a | One vendor for the boring layer |
| Async jobs | Inngest | — | every specialist run, discovery, image | n/a | Durable, retried, observable |
| Payments | Stripe | — | credits + subscriptions | n/a | Per-tier (`CI_TIERS`) |
| Email | Resend | — | delivery notifications | n/a | "Your run is ready" |

**Rule:** each vendor lives behind a single interface in `/backend/integrations/<vendor>.ts`. Swapping `gpt-image-1` for Flux 1.1 means editing one file. The frontend canvas never knows.

### 3.2 Internal endpoints (frontend ↔ backend)

```
POST /api/discovery/start         { url } → { discoveryId }
GET  /api/discovery/:id/stream    SSE → { stage, signal, partialBio }
GET  /api/bios/:brandId           { bio, version }
PATCH /api/bios/:brandId          { patch } → { bio, version+1 }   ← BIO editor saves here
POST /api/bios/:brandId/sources   { url|file } → adds a source, kicks off re-read

POST /api/briefs                  { brandId, requestText } → { briefId, clarifications }
POST /api/briefs/:id/answer       { qa: [...] } → { sharpenedBrief }

GET  /api/specialists             returns catalog (55; 50 live, 5 soon)
GET  /api/specialists/:id         spec (team) or display (client) shape
POST /api/specialists/:id/preview { brandId, sampleBriefId } → { composedPrompt, dryRunOutput, qa }   ← test harness

POST /api/assembly                { briefId, specialistIds[] } → { runIds[] }
GET  /api/runs/:id/stream         SSE → { token | done | error }
GET  /api/runs/:id                final { output, rationale, qa, tokens, cost }

POST /api/qa/gate                 { outputId | text, refusals[] } → { passed, violations[] }

GET  /api/ledger?workspaceId      paginated
POST /api/stripe/checkout         { tier }
POST /api/auth/*                  Supabase wrappers
POST /api/uploads                 multipart → { fileId, url }
```

Authentication is row-level: every endpoint resolves `workspaceId` from session and Supabase RLS denies cross-workspace reads. No exceptions.

---

## 4. Specialist inventory — completing the 49 non-motion/video specs

Brandolph is the L1 operator (orchestrator). The catalog contains 55 L2 specialists; 49 are in scope here regardless of status. L3 are humans on the team and stay out of this plan.

### 4.1 Brandolph (L1)

| Capability | What it does | Trigger | Model |
|---|---|---|---|
| Brief sharpening | Vague request → sharpened brief + clarifications | `POST /api/briefs` | Opus |
| Crew assembly | Picks the specialists for a brief, with rationale | After clarifications answered | Opus |
| Ask Brandolph | Streaming chat scoped to the open brief + BIO | Canvas "Ask Brandolph" node | Sonnet (Opus for hard) |
| BIO synthesis | Discovery signal → BIO | After discovery scrape + vision pass | Opus |

Brandolph is **not** a specialist row. It's the runner that *invokes* specialists, plus the four endpoints above. Internally it shares the four-layer prompt composer; only the SPEC layer differs (Brandolph has its own).

### 4.2 The expanded catalog

The catalog must be read from data, not reconstructed from the original 33-record plan.

| Department | IDs | Count | Scope |
|---|---|---:|---|
| Strategy | a01-a05, a34 | 6 | live / included |
| Concept | a06-a11, a35-a36 | 8 | live / included |
| Copy | a12-a18, a37-a40 | 11 | live / included |
| Visual | a19-a22, a24, a41-a46 | 11 | 10 included; a44 deferred video preproduction |
| Web & UX | a23, a25, a26, a29, a47-a49 | 7 | live / included |
| Motion & Sound | a27, a28, a50-a52 | 5 | soon / deferred |
| Research & Ops | a30-a33, a53-a55 | 7 | live / included |

The fastest path to a live brand still begins with a small vertical slice. Fan-out then covers all 49 in-scope records over the shared runtime, without using status as a spec-coverage exemption.

**Tier T1 — bring up the runtime (text only)**

| ID | Name | Dept | Model | Why first |
|---|---|---|---|---|
| a30 | BIO Compiler | Research & Ops | Gemini Pro | Without it, no BIO. Wires the Discovery → BIO endpoint. |
| a02 | The Sharpener | Strategy | Sonnet | Without it, briefs are just request text. |
| a12 | Conversion Copy | Copy | GPT-5 / Sonnet | The first node a customer wants to see fill in live. |
| a18 | Voice QA | Copy | Haiku | The QA gate. Output cannot be `approved` without it. |

**Tier T2 — complete bespoke text specs and broaden text coverage**

Cover all live Strategy, Concept, Copy, and text-producing Research & Ops records, including expanded ids a34-a40 and a53-a55. They share the text runner, but each must own a bespoke spec rather than relying only on a department template.

**Tier T3 — image specialists**

a19-a22, a24, a35, a41-a43, a45-a46, and a23/a48 where their output route is image-based. Adds the image provider interface, object storage, longer job timeouts, per-image cost, and output-shape handling.

**Tier T4 — research + ops**

a30-a33 and a53-a55. Adds research tools to the runner and keeps internal specialists (`a30`, `a33`) covered even though they are hidden from the public directory.

**Tier T5 — composed outputs**

a25 Page Composer, a26 Email Build, a29 Framer Builder, a47 Component Library, and a49 Wireframe / Flow. Adds vendor-specific web output shapes without pulling deferred deck/motion work into scope.

**Deferred — Motion & Sound**

`a27`, `a28`, `a44`, `a50`, `a51`, and `a52` are deferred. Deck, motion/video, voiceover, storyboard, style-frame, and sonic-provider work belongs to a later milestone and is not part of the current completion claim.

### 4.3 The spec row for every specialist

Already partly modeled. Make this the canonical `specs` table:

```ts
{
  id,                    // current catalog ids a01..a55
  version,               // bump on every change; runs pin to the version they used
  code, name, dept,
  role, objective,
  method: string[],
  outputContract,        // shape + length + how it's judged
  voice,
  refusals: string[],    // brand-global refusals are inherited
  tools: ToolName[],     // ["exa.search","image.generate","none"]
  modelRouting: { primary, fallback, reason },
  cr,                    // estimated credits (regenerated from real cost weekly)
  status,                // draft | live | soon
  bioSlices: BioSlice[], // which fields of the BIO this specialist reads
}
```

`bioSlices` is the new field worth calling out: it makes the BIO injection explicit per specialist (Copy gets voice+forbidden, Design gets palette+type, etc.). It removes ambiguity in the prompt assembler and lets us minimise tokens (cheaper) and audit which specialists are affected when a BIO field changes.

---

## 5. Data model (the schema)

```
workspaces (id, name, tier, stripe_customer_id)
users (id, workspace_id, email, role)
brands (id, workspace_id, name, url)
bios (id, brand_id, version, payload jsonb, score, created_by, created_at)   ← BIO editor writes a new row
bio_sources (id, brand_id, kind, src, signals, created_at, raw_ref)          ← "Feed Brandolph" appends
briefs (id, brand_id, title, type, payload jsonb, status, sharpened_payload jsonb)
clarifications (id, brief_id, q, a, why)
specialists (id, name, dept, ...)                                            ← seed from CI_AGENTS
specs (id, specialist_id, version, payload jsonb, active boolean)            ← seed from CI_DEPT_SPECS
runs (id, brief_id, specialist_id, spec_version, bio_version, status, model,
      prompt_tokens, completion_tokens, cached_tokens, cost_usd, latency_ms,
      started_at, ended_at)                                                  ← one row per specialist invocation
outputs (id, run_id, brief_id, kind, body jsonb, asset_url, status, rationale)
qa_results (id, output_id, refusal_id, passed, evidence)
ledger (id, workspace_id, run_id, credits, kind, balance_after, created_at)
uploads (id, workspace_id, user_id, url, mime, brand_id)
sessions (Supabase auth)
```

Notes:

- `bios` is **append-only versioned**. Every edit in the BIO editor writes a new version; runs pin to the version they used → reproducibility.
- `runs` joins `spec_version` AND `bio_version` → "what prompt actually ran" is recoverable forever.
- `outputs.body` is JSONB so it can hold structured copy (`{body,rationale,meta}`) or image refs.
- `ledger` is event-sourced; balance is denormalised but always recomputable.

The board's `buildBriefGraph()` reads brief → runs → outputs → specialists. Same shape as today, just over real rows.

---

## 6. Build phases

Each phase is shippable and visible on the canvas. Stop here if budget runs out — every prior phase still works.

### P0 — Backend skeleton + first streaming call _(1 week)_

- Supabase project up; schema (§5) migrated.
- Hono edge API up; `/api/runs/:id/stream` SSE plumbed.
- Inngest connected; one job: "ask brandolph" → Anthropic Sonnet streaming.
- One canvas node (Ask Brandolph) wired to the live endpoint.
- Mock auth replaced with Supabase magic-link (one user).

**Done when:** a real Claude reply streams into the existing Brandolph node.

### P1 — Discovery → BIO live _(2 weeks)_

- `/api/discovery/start` + Inngest job.
- a31 Site Scanner (Firecrawl) writes raw pages → `bio_sources`.
- Screenshot + Claude vision → palette + type extraction → BIO draft.
- a30 BIO Compiler (Opus) synthesises the BIO from sources.
- BIO editor saves write to `bios` (new version).
- "Feed Brandolph" composer hits `/api/bios/:brandId/sources`.

**Done when:** typing a real URL yields the BIO we've been mocking, and the editor's changes persist.

### P2 — Brief sharpening + clarifications live _(1 week)_

- a02 Sharpener wired to `/api/briefs`.
- Clarifications generated by Brandolph; round-tripped through the UI.
- `sharpened_payload` written to `briefs`.

**Done when:** "Pricing relaunch — Tuesday" can be created from scratch with real Q&A.

### P3 — First production specialist run + QA gate _(1 week)_

- a12 Conversion Copy live: Sonnet + structured output + streaming.
- a18 Voice QA live: Haiku scores against `CI_BRAND_REFUSALS`.
- Refusals stored on `brands.refusals` + `specs.refusals`.
- Forbidden-words is a local pre-check before the Haiku call (free + fast).
- Output node on canvas fills live; QA verdict shown.
- Ledger writes real cost.

**Done when:** clicking a specialist node fills it with real, on-brand copy, gated by real QA.

### P4 — Text fan-out _(1–2 weeks)_

- Complete bespoke specs and runtime coverage for every text specialist in the 49-record scope. All share the runtime; most work is spec data, tools, and per-department BIO slices.
- Prompt caching turned on; verify >90% cache hit on PLATFORM+BIO.

**Done when:** every text-only specialist on the brief board can run.

### P5 — Image specialist + storage _(1–2 weeks)_

- fal.run integration (Flux 1.1 Pro). One interface (`generateImage`).
- Supabase Storage bucket for outputs; signed URLs.
- a20 Hero KV live; a19 Identity Drafts live behind it.
- a24 Brand Consistency QA does vision-based on-brand check.
- Per-image credits in the ledger.

**Done when:** Hero KV node generates a real on-brand image into the canvas.

### P6 — Composed outputs _(2 weeks)_

- a25 Page Composer (v0 SDK).
- a26 Email Build (v0 + Resend preview).
- a29 Framer Builder plus the live Web & UX support specialists.
- Output kinds in `CI_OUTPUT_KINDS` map to real rendering surfaces.

**Done when:** a brief ships a full in-scope assembly — page + emails + image — from one click.

### P7 — Multi-tenant + Stripe + tier gates _(1–2 weeks)_

- Workspaces are first-class. `CI_WORKSPACES` becomes a real table.
- Stripe checkout per `CI_TIERS`; webhooks update `workspaces.tier`.
- `specs.tierFrom` enforced at the assembly endpoint (matches `CI_DEPT_META.tierFrom`).
- Hard monthly spend cap per workspace + per-run cost ceiling.

**Done when:** the product can be sold.

### P8 — Deferred Motion & Sound _(separate milestone)_

- Scope `a27`, `a28`, `a44`, and `a50-a52` only after the 49 in-scope specs and runtime paths are complete.
- Select deck, motion/video, storyboard, voiceover, and audio providers and define their output/QA contracts separately.
- None of this work blocks the current completion gate.

---

## 7. Cost economy

The credit price each specialist shows today (`cr`) is the **estimate**, not the truth. Make it real:

```
credits = ceil(
  α · input_tokens/1k  +  β · output_tokens/1k  +  γ · uncached_input/1k +
  δ · cached_input/1k  +  ε · per_image
)
```

α, β, γ, δ, ε are model-specific. Recompute weekly from actual model prices; store in a `pricing` table so updating prices is a row change.

**Caps (hard):**

- Per-run: `budget.maxCredits` enforced before dispatch; runner aborts if mid-run.
- Per-workspace per day: configurable; default tied to tier.
- Per-vendor monthly: a kill-switch the operator can flip.

**Prompt caching (the multiplier):** Anthropic's 5-minute TTL means PLATFORM+BIO layers stay cached across a brief's assembly run. Expected savings: 60–80% on input cost for the second through Nth specialist in an assembly. This is the single biggest cost lever and the reason for the four-layer prompt.

**Show estimates before running.** The brief preview already promises this; wire `/api/briefs/:id/estimate` to compute Σ(specialist estimated credits) before assembly dispatches.

---

## 8. Observability + governance

- **Per-run audit:** every `runs` row carries the full composed prompt (separately stored, blob-referenced), model, version pins, tokens, cost, latency, QA verdict, and the operator who triggered it. Recoverable forever.
- **Spec versioning:** changing a spec creates a new version; old runs stay pinned to the version they ran. Settings page shows a diff per spec.
- **BIO versioning:** same idea. Runs reference `bio_version`. The "this output was generated against BIO v7" line appears on every output card.
- **PII on uploads:** brand books may contain pricing, internal team info. Storage is per-workspace bucket; signed URLs only; nothing is sent to third-party models without an opt-in.
- **Vendor outage:** every external API has a circuit breaker + a "degraded" mode (e.g. when Flux is down, the canvas shows the image specialist as `degraded`, not failed).

---

## 9. Open decisions (lock before P0)

1. **Backend host** — Supabase + Hono on Cloudflare Edge (recommended) vs. a Node monolith on Render/Fly. _Recommend: Supabase + edge._
2. **Async runtime** — Inngest (recommended) vs. Trigger.dev vs. roll-our-own with `pgmq`. _Recommend: Inngest — best DX, generous free tier._
3. **Image provider primary** — Flux 1.1 Pro on fal (recommended), gpt-image-1, Imagen 3, or Recraft? _Recommend: Flux for visual quality + speed._
4. **Live brand for P1** — need a real URL + permission. Vinilo is the obvious mock — is there a real coffee partner who'd let us run on their site?
5. **Budget ceiling** — hard monthly cap before live keys go in. Suggest $250/month soft, $500 hard for the demo workspace until P5.
6. **Auth timing** — Supabase auth from P0 (recommended) or keep mock until P3? _Recommend: from P0 — the workspace boundary is too cheap to defer and too expensive to retrofit._
7. **L2 rename (M4 from `specialists-plan.md`)** — do the `CI_AGENTS → specialists` code rename before or after P0? _Recommend: before — new server code should be born with the right naming._

---

## 10. Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Vendor cost runs away | high | high | Hard caps + per-vendor kill switch + estimate before run |
| Prompt caching hit-rate is lower than projected | med | med | Measure in P3; if <60%, restructure prompt order (PLATFORM first, BIO second, both static) |
| BIO extraction is wrong on first pass | high | med | The BIO editor (just shipped) is the recovery surface — every value is editable, every source is removable |
| Image gen drifts off-brand | high | med | a24 Brand Consistency QA is in the runtime, not optional — outputs without a passing QA never reach the canvas |
| Long-running specialists hit edge timeout | med | high | All long jobs run on Inngest workers, never on the edge — SSE only forwards |
| RLS misconfig leaks brands across workspaces | low | catastrophic | RLS tests in CI; security review before P7 ships |
| 49-spec rollout balloons | med | low | Executable coverage plus tier order (§4.2) keeps the gap visible and the runtime shippable |

---

## 11. What ships first (recap)

P0 → P3 is the minimum viable shape: real backend, one real specialist, the QA gate, the canvas fills in. **Three weeks.** Everything after that is fan-out over the same runtime.

If we can only build one thing this quarter, it's the **Specialist Runtime (§2)** with prompt caching. That single piece is the moat — the BIO is the data moat, the runtime is the execution moat. Specialists are configuration rows over that runtime.

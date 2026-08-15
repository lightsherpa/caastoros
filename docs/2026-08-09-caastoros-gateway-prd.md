# CaastorOS Gateway — PRD v0.1

**Working name:** CaastorOS Gateway (internal codename only; public naming goes through the brand-architecture triggers, not this doc)
**Date:** 2026-08-09
**Owner:** Oscar Motta
**Status:** Draft for ratification
**Decisions already made:** metered credits · MCP + REST API in parallel · text + image specialists in v1

---

## 1. Thesis

Birdeye shipped an MCP server that makes their data queryable. Nobody has shipped one that makes certified creative capability callable. CaastorOS Gateway exposes Brandolph, the specialist crew, and the certified BIO as infrastructure that any AI assistant or partner platform can call: brief in, brand-certified creative out, with the certification chain attached.

This is not a pivot away from the product. The canvas remains the product and the moat after the BIO. The Gateway is a vending window: external callers get outputs and certification metadata, never the orchestration, never the composite prompt, never internal economics.

**One line:** the first generative, human-certified brand MCP. Everyone else's MCP answers questions about the past. Ours produces the future.

## 2. Why now

- Birdeye's MCP (30 tools, 11 areas) is read-only analytics. The generative slot in the category is empty.
- "Agentic marketing platforms" are teaching the market that AI creative is a $50/month feature. The counter is not louder marketing, it is distribution: put certified creative inside the tools where work already happens.
- The infrastructure is 70% built. Runs, credits, QA gates, BIO certification, spec versioning, and the model router already exist and are production-hardened. The Gateway is mostly an auth layer, an async layer, and two thin surfaces on top.

## 3. Goals

1. Any MCP client (Claude, ChatGPT, Gemini, internal agents) can run CaastorOS specialists against a certified BIO in natural language.
2. Any partner platform can integrate via REST: create briefs, fire runs, receive outputs by webhook.
3. Every external call is metered in credits against a workspace, with per-key budgets. External surfaces show credits only. Raw API costs never leave the ledger.
4. Every output carries its certification chain: BIO version, certifier, spec version, QA verdict.
5. Zero disruption to the current app. Parallel namespace, parallel development, no changes to existing SPA flows.

## 4. Non-goals

- Not a horizontal "AI orchestration platform." Brand intelligence territory only (rename tripwires apply otherwise).
- Not a replacement for the canvas. No external surface renders the canvas or replicates its interactions.
- Not exposing the BIO itself. External callers get a BIO card (summary + certification metadata), never the full object.
- No fine-grained model selection by external callers. Routing stays spec-driven and internal. Callers may request a quality tier at most.
- No disclosure of the six-figure composite behind Brandolph. Ever. Standing rule.

## 5. Users and use cases

| User | Surface | Example |
|---|---|---|
| Brand teams living in Claude/ChatGPT | MCP | "Ask CaastorOS for three campaign concepts for the summer drop, on brand" |
| Partner platforms (schedulers, CMS, commerce) | REST API | Buffer-style tool pulls certified social copy + visuals into its queue |
| Client-side internal agents | MCP or REST | A client's ops agent files a brief and collects approved outputs |
| Agencies white-labeling production | REST API | Agency's portal fires CaastorOS runs under their client workspaces |
| Caastor itself | Both | Dogfood: Caastor's own marketing automations call the Gateway |

## 6. Product definition

One gateway, two surfaces, one shared service core.

```
                    ┌─────────────────────────────┐
  MCP clients ──────▶  /mcp   (Streamable HTTP)   │
                    │                             │      ┌──────────────┐
                    │   shared run-service core   │─────▶│ existing libs │
                    │   (extracted from routes)   │      │ router · QA   │
  Partners ─────────▶  /v1    (REST + webhooks)   │      │ BIO · credits │
                    └─────────────────────────────┘      └──────────────┘
```

### 6.1 MCP server (v1 toolset, ~12 tools)

| Tool | What it does | Notes |
|---|---|---|
| `list_brands` | Brands in the authorized workspace | |
| `get_brand_card` | BIO summary + certification metadata | Never the full BIO |
| `sharpen_brief` | Raw ask → CMO-grade sharpened brief + recommended crew | Wraps the Sharpener |
| `run_specialist` | Fire one specialist against a brief | Text: sync. Image: returns job id |
| `run_crew` | Brandolph assembles and fires N specialists under one brief | The flagship tool |
| `get_run` / `get_job` | Status + result of a run or async image job | |
| `list_outputs` / `get_output` | Retrieve outputs with QA verdict + certification chain | |
| `check_credits` | Workspace balance + this key's budget remaining | Credits only |
| `get_usage_summary` | Runs and credits over a period, per specialist | |
| `request_review` | Push an output to human review in the portal | The entwinement hook |

Tool descriptions are marketing surface. They will be written in brand voice and treated as copy, not comments.

### 6.2 REST API (v1)

```
POST   /v1/briefs                  create brief (optionally auto-sharpen)
POST   /v1/runs                    fire specialist run  { specialist_id, brief_id | brief_text, brand_id, deliverable_spec? }
POST   /v1/crews                   Brandolph assembly run (N specialists, one brief)
GET    /v1/runs/:id                run status + result
GET    /v1/jobs/:id                async job status (images)
GET    /v1/outputs?brief_id=       list outputs (QA + certification chain included)
POST   /v1/outputs/:id/review     request human review
GET    /v1/brands                  list brands
GET    /v1/brands/:id/card         BIO card
GET    /v1/credits                 balance + key budget
POST   /v1/webhooks                register endpoint (HMAC-signed deliveries)
```

Conventions: versioned path, idempotency keys on all POSTs, cursor pagination, RFC 7807 problem JSON errors, per-key rate limits in response headers.

### 6.3 Response contract — the certification chain

Every output payload carries:

```json
{
  "output": { "kind": "campaign_concept", "body": "..." },
  "qa": { "passed": true, "voice_match": 0.92 },
  "certification": {
    "bio_version": 7,
    "certified_by": "steward:ana.r",
    "spec_version": 12,
    "brand": "acme"
  },
  "credits_debited": 12
}
```

Stripped from every external payload: `cost_usd`, `model_used`, provider names, token counts, routing reasons. Internal economics stay internal. Standing rule.

## 7. What exists vs what must be built

Grounded in `server/src/` as of 2026-08-09.

### Already built and reusable as-is

| Capability | Where | Gateway reuse |
|---|---|---|
| Run pipeline: brief → spec → BIO → route → QA → output → ledger | `routes/runs.js` | The entire engine |
| Credit estimation + balance check + ledger debit | `lib/credits.js`, `ledger` table | Metering core |
| Certified-BIO enforcement (409 if uncertified) | `lib/load-brand-bio.js` | Brand-safety gate, already correct |
| Spec-driven model routing, vendor-agnostic | `lib/models/router.js` | Untouched |
| Voice QA + Vision QA gates | `lib/qa-voice.js`, `lib/qa-vision.js` | Untouched |
| Brandolph memory signals | `lib/brandolph-memory.js` | External runs feed the same memory. Compounding accelerates |
| Image pipeline with Storage persistence + signed URLs | `routes/runs.js` image branch | Wrap in jobs |
| Spec + BIO version pinning per run | `runs` table | The certification chain is already recorded |
| Deliverables mode (N structured items, per-item QA) | `lib/deliverables.js` | Exposed via `deliverable_spec` |

### Must be built

| # | Component | Detail |
|---|---|---|
| B1 | **Machine auth layer** | `api_keys` table: hashed key, workspace_id, brand scope (optional), scopes, credit budget cap, rate tier, status, last_used. `requireApiKey` middleware parallel to `requireAuth`. Keys managed from portal admin. |
| B2 | **Run service extraction** | The ~500-line SSE handler in `routes/runs.js` becomes `lib/run-service.js` with a streaming and a promise interface. SPA route, `/v1`, and MCP all call it. Behavior-preserving refactor. **Needs your explicit go before touching `runs.js`** (standing rule: no flow changes without verification). |
| B3 | **`/v1` REST namespace** | New `routes/v1/` mounted in `index.js`. External-safe serializers (strip internal fields). Idempotency via `idempotency_keys` table. |
| B4 | **Jobs layer** | `jobs` table + Inngest function for image runs. External callers poll `/v1/jobs/:id` or receive webhooks. (Internal SPA keeps SSE; external callers get job semantics.) |
| B5 | **Webhooks** | `webhook_endpoints` + `webhook_deliveries` tables, HMAC-SHA256 signatures, retries with backoff via Inngest. Events: `run.completed`, `run.flagged`, `job.completed`, `output.reviewed`, `credits.low`. |
| B6 | **MCP server** | `server/src/mcp/` on `@modelcontextprotocol/sdk`, Streamable HTTP transport mounted at `/mcp` on the same Hono app. Auth: bearer API key v1 (works today with Claude and ChatGPT custom connectors), OAuth 2.1 in v1.1. |
| B7 | **Per-key metering + limits** | `ledger.api_key_id` column; per-key budget enforcement before `assertCreditsAvailable`; Postgres sliding-window rate limiting v1 (Redis only if load demands). |
| B8 | **Review modes** | Per-key output policy: `auto` (QA-passed releases immediately), `review` (held for human approval in portal), `certified` (steward sign-off). Maps onto existing `approved`/`flagged` status flow. Steal of Birdeye's draft/approval/full-auto, upgraded with a human who actually has judgment. |
| B9 | **Sandbox** | One demo brand with a certified BIO in a sandbox workspace. Sandbox keys: zero real credits, watermarked outputs, aggressive rate limits. This is the top of funnel. |
| B10 | **Docs + quickstart** | Public docs site: 5-minute MCP quickstart (Claude Desktop config block), REST reference, webhook guide. Birdeye shipped a quickstart day one. So do we. |
| B11 | **Usage surface in portal** | Admin view: keys, runs by key, credits by key, QA pass rate external vs internal. Credits only, no costs. |

## 8. Infrastructure requirements

| Area | Requirement | Decision |
|---|---|---|
| Hosting | Same Render service, same Hono app, new route namespaces | No new service in v1. Split `api.getcaastor.co` onto its own Render service only when external load justifies it. `render.yaml` gains `MCP_ENABLED`, `PUBLIC_API_ENABLED` flags so the surfaces can ship dark. |
| Domain | `api.getcaastor.co` → same service; CORS is irrelevant for key-auth server-to-server calls but `/v1` and `/mcp` must bypass the SPA CORS allowlist explicitly | Add alongside `app.getcaastor.co` |
| DB | Supabase, new tables: `api_keys`, `idempotency_keys`, `jobs`, `webhook_endpoints`, `webhook_deliveries`; `ledger.api_key_id` migration | Same project, RLS + service-role pattern as today |
| Queue | Inngest (already wired) for image jobs and webhook delivery/retries | No new vendor |
| Rate limiting | Postgres sliding window per key, v1 | Upstash Redis only if p95 suffers |
| Secrets | Existing env pattern; add `WEBHOOK_SIGNING_SECRET` | |
| Cost control at scale | Per-key credit budgets (hard stop), spec-driven routing unchanged (cheap tier stays default per the ~57% savings pass), image jobs capped per key per day, sandbox watermarked | Standing rule: cost optimization at scale, best result |
| Observability | Per-key request logging to `api_usage`; alerts on budget exhaustion and QA-fail spikes | Portal admin surface, B11 |

## 9. Guardrails (non-negotiable)

1. **Vending window, not back door.** Outputs + certification metadata out. Composite prompt, orchestration logic, six-figure blend, routing internals: never.
2. **Credits only.** No `cost_usd`, provider, model, or token fields in any external payload or doc.
3. **Certified BIOs only.** Uncertified brand → 409, same as today. No "bring your own brand guidelines JSON" mode. The certification is the product.
4. **Refusals always enforced.** External briefs pass through the same refusal checks as internal ones.
5. **Canvas untouched.** The Gateway links back into the portal (review requests, canvas share links in Phase 3). It never re-implements it.

## 10. Monetization

Metered credits, same currency as the platform.

- External runs debit the workspace ledger with `api_key_id` attribution. Same `estimateRunCredits` math.
- Per-key monthly credit budgets, set in portal admin. Hard stop + `credits.low` webhook at 80%.
- Packaging: Gateway access included from the Dam plan up (working assumption, price later); credit packs sold identically to today. Partners with volume get contracted packs, not discounted internals.
- Sandbox is free, watermarked, and rate-limited. Conversion path: sandbox key → paid workspace key.

## 11. Phasing (parallel to current roadmap)

**Phase 0 — Foundations (weeks 1–2).** B1 keys + middleware, B2 run-service extraction (after your go), B3 `/v1` with text runs sync, external serializers, per-key ledger attribution. Exit: a curl with a key gets certified copy back.

**Phase 1 — Two surfaces (weeks 3–5).** B6 MCP server with the 12 tools, B4 jobs for images, B5 webhooks, B9 sandbox brand, B10 quickstart docs. Exit: Claude Desktop runs `run_crew` end to end, images included, and a partner can integrate REST without talking to us.

**Phase 2 — Partners (weeks 6–8).** 3–5 design partners on real workspaces, B8 review modes, B7 rate limit hardening, B11 usage surface. Exit: first external credits burned weekly by someone who isn't us.

**Phase 3 — Distribution.** Anthropic MCP directory + ChatGPT connector listings, Zapier/n8n connectors, canvas share links for outputs, OAuth 2.1. Public launch narrative: "the first brand MCP that creates."

## 12. Metrics

- Time-to-first-run for a new key (target < 10 minutes with quickstart)
- External runs/week and external credits/week (the revenue signal)
- QA pass rate external vs internal (brand-safety signal; divergence means external briefs need better sharpening defaults)
- % of external outputs sent to `request_review` (entwinement signal: humans staying in the loop is a feature, track it proudly)
- Sandbox → paid key conversion

## 13. Risks

| Risk | Mitigation |
|---|---|
| Prompt/IP extraction attempts via MCP | Outputs-only contract; no prompt echo; refusal + anomaly logging per key |
| Cost blowout from external volume | Per-key hard budgets, cheap-tier routing defaults, image caps, credits-before-run check already in the pipeline |
| Channel conflict: partners reselling under us | Credit pricing identical everywhere; partner value is distribution, not arbitrage |
| Category confusion ("is CaastorOS an API company now?") | Vision-layer language only: the OS for brand intelligence, now callable. Sales layer in Spain unchanged. Never mix altitudes |
| MCP spec churn | Official SDK, Streamable HTTP (current standard), thin transport layer so churn stays in one file |
| `runs.js` refactor regression | B2 is behavior-preserving, gated on your explicit approval, covered by `test:run` smoke before and after |

## 14. Open questions for Oscar

1. Ratify the B2 extraction of `runs.js` into a shared run service (required for everything else; touches existing flow, so per standing rule it needs your explicit yes).
2. Which plan tier includes Gateway access (working assumption: Dam and up).
3. First three design-partner candidates (GCC client with internal agents? A Spanish scheduler? Caastor's own marketing stack as partner zero?).
4. Public naming: "CaastorOS Gateway" vs surfacing it simply as "CaastorOS for agents." Runs through brand-architecture doctrine, not engineering.

---

*Reference: Birdeye MCP server (read-only, 30 tools) — the competitive trigger. This PRD is the generative answer.*

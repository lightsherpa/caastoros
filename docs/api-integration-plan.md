# CaastorOS — API integration plan (real live example)

_Status: PLAN. Take one real brand from **discovery → BIO → brief → specialists → outputs** (copy, social posts, images) with live model/API calls. Today everything is mock (`CI_*` on `window`); this is the path to making it real._

## 1. The target

Pick one brand (e.g. a real coffee brand with a website). End to end, live:

```
URL → Discovery → BIO → Brief (+ clarifying Qs) → assemble specialists
    → run specialists (copy · social · images) → QA gate → outputs on the board
```

Each board node becomes backed by a real artifact produced by a real model call.

## 2. Hard constraint: this needs a backend

The portal is a static Vite SPA. **API keys can never ship to the browser.** So step one is a thin backend (the only non-negotiable architectural change):

- **Backend**: a small Node service (or serverless functions — Vercel/Cloudflare/Lambda). Holds keys, calls the model/3rd-party APIs, streams results back.
- **Frontend**: replaces the `window.CI_*` reads with `fetch` to our backend; keeps the exact same component tree (canvas, drawers, specialist prompts).
- **Persistence**: a DB (Postgres or even SQLite to start) for brands, BIOs, briefs, specialists, outputs, ledger. Mock data becomes seed data.
- **Async**: image gen + multi-specialist runs are slow → a **job queue** (or just async endpoints + polling/SSE). The canvas already tolerates "in-production" states; wire those to real job status.

## 3. The pipeline — stage by stage, with the API per stage

| Stage | What it does | API / model | Notes |
|---|---|---|---|
| **Discovery** | Ingest a URL: copy, structure, visual identity | **Exa** (or simple fetch + readability) for pages; **Claude (vision)** on a screenshot for palette/type/imagery; optional **Firecrawl** for clean scrape | Produces raw signal for the BIO |
| **BIO synthesis** | Turn signal into the Brand Intelligence Object (positioning, voice, audience, mandatories, forbidden-words, pricing rules) | **Claude Opus** (long-context judgment) | This is the canon every later call is grounded on |
| **Brief + clarify** | Sharpen a request into a brief; generate the clarifying questions Brandolph asks | **Claude Opus** (the L1 operator) | Already modeled: `BrandolphDiagnosis` / brief `clarifications` |
| **Specialist run — copy** | Run a copy/strategy specialist | **Claude Sonnet** (Haiku for cheap/short) | Use `composeSpecialistPrompt()` verbatim as the system prompt |
| **Specialist run — social** | Social posts / captions / threads | **Claude Sonnet** | Same prompt assembly; output contract = platform format |
| **Specialist run — image** | Key visuals, labels, KVs | **image API** — pick one: OpenAI `gpt-image-1`, **Flux** via Replicate/fal, or Google **Imagen**. (Claude does not generate images.) | Prompt built from the BIO visual rules + brief direction |
| **Brand QA gate** | Score each output against the refusal rules | **Claude Haiku** (cheap, fast) | The `runQaGate()` heuristic becomes a real model check; gates `status: approved` |

**Model routing already exists conceptually** — `CI_MODELS` maps each specialist to opus/sonnet/haiku/etc. Make that routing real: the spec's `modelRouting` selects the actual endpoint.

## 4. Recommended stack (smallest real version)

- **Text / strategy / QA:** **Anthropic Claude API** — Opus for L1 (BIO, brief, sharpening), Sonnet for L2 copy/social specialists, Haiku for the QA gate. Use **prompt caching** on the two stable layers of every prompt (PLATFORM preamble + BRAND/BIO context) — they repeat across every specialist call for a brand, so caching cuts cost/latency hard. **Stream** text outputs so nodes fill in live.
- **Images:** start with **one** provider behind an interface (`generateImage({prompt, size})`) — Flux (fal/Replicate) or `gpt-image-1`. Swap later without touching the canvas.
- **Discovery:** Exa for search/read + Claude vision on a homepage screenshot for the visual half of the BIO.
- **Backend:** Node + a couple of endpoints; SSE for streaming; a jobs table for image/long runs.
- **DB:** Postgres (Supabase is a fast start — DB + auth + storage for generated images).

## 5. Data model (replace the `CI_*` mocks)

`brands` · `bios` (versioned) · `briefs` (+ clarifications) · `specialists` (+ specs, versioned — from the prompting plan) · `runs` (a specialist execution: prompt sent, model, tokens, cost, status) · `outputs` (text or image URL, rationale, QA result, links to brief+specialist) · `ledger` (credits, mapped from real token/image cost).

The board's `buildBriefGraph()` already derives the BIO→brief→specialist→output graph from this exact shape — so once the data is real, the canvas "just works."

## 6. How it maps to what's already built

- `composeSpecialistPrompt(a, isTeam, spec)` → **the actual system prompt** sent to Claude. Already produces PLATFORM + BIO + SPEC + TASK; the TASK placeholder gets the real brief.
- `CI_BRAND_REFUSALS` + `runQaGate()` → the real QA gate (Haiku checks the output against the rules; forbidden-words stays a cheap local pre-check).
- `outputRationale` → ask the specialist to **emit its rationale as part of its structured output** (JSON: `{ body, rationale, meta }`), so "why this creative choice" is real, not derived.
- Credits → map token + image cost to credits at run time; write to the ledger.
- The board's "Ask Brandolph" node → a streaming Claude call scoped to the brief + BIO.

## 7. Credits & cost

Define a cost table: `credits = ceil(f(input_tokens, output_tokens, model))` for text; a flat credits/image for image gen. Show the estimate **before** running (the brief preview already promises "previews cost first"), then reconcile actuals into the ledger after the run.

## 8. Phasing

- **P0 — Backend skeleton + 1 real Claude call.** Stand up the service + DB; make the board's "Ask Brandolph" hit Claude for real (streamed). Smallest possible end-to-end.
- **P1 — Discovery → BIO.** URL in → real BIO out (Exa + Claude + vision). Replace the mock BIO for one brand.
- **P2 — Brief + clarifications live.** Real sharpening + questions from Opus.
- **P3 — One copy specialist live.** `composeSpecialistPrompt` → Sonnet → output node + rationale + QA gate (Haiku).
- **P4 — Social specialist.** Same path, platform-shaped output.
- **P5 — Image specialist.** Image API behind the interface; store to object storage; render in the result node.
- **P6 — Full board live.** Assemble runs all specialists; nodes stream/fill; credits reconcile; QA gates statuses.

Each phase is shippable on its own and visible on the board.

## 9. Decisions to confirm before P0

1. **Which brand** for the live example (need a real URL).
2. **Backend host** — Supabase + serverless (recommended fast path) vs. a standalone Node service.
3. **Image provider** — Flux (fal/Replicate) vs. OpenAI `gpt-image-1` vs. Google Imagen. (One, behind an interface.)
4. **Auth** — keep the mock login, or wire real auth (Supabase) since we'll have a backend anyway.
5. **Budget guardrails** — a hard monthly spend cap + per-run cost ceiling before we point it at live keys.

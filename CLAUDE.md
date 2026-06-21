# CaastorOS — Project Memory

> **The project is called CaastorOS.** Never "intelligence", never "Claudio", never anything else. In file paths, code, copy, docs, and conversation — CaastorOS.

## Standing user rules (verbatim — do not violate)

- "don't change flow or features without verifying with me first"
- "from now on focus only on the ask and don't modify anything outside of the request"
- "from now on when integrating an API think cost optimization at scale and best result"
- "remove any signal of internal api costings.. only show credits to the user"
- "I just don't want you wasting credits"
- "respect what we've done and keep everything tight"
- "the canvas is the center of the experience... after the BIO this is our MOAT"
- When integrating APIs: hybrid routing across Anthropic + OpenRouter + fal.ai + direct vendors. Pick cheapest model that meets quality bar for the task.

## What it is

A brand-methodology platform. **Brandolph** (L1 AI brand director) orchestrates **55 specialist agents** (L2) on top of a **senior-human-certified Brand Intelligence Object (BIO)**. Output lands on an **interactive canvas** — the user-facing moat after the BIO.

Brandolph's composite system prompt internally encodes the operating principles of six branding figures (Twohill / Galliera / Joswiak / Lee / Kitschke / Godin). **Internal only. Never disclosed in the product surface.**

## Architecture

| Layer | Stack | Port |
|---|---|---|
| SPA | React 18 + Vite (no router lib, hash-based) | 5173 |
| API | Hono on Node | 8787 |
| DB / Auth / Storage | Supabase (project ref `yemzrohzqfuxmekcgnnh`) | — |
| Queue | Inngest | — |

**Streaming model:** SSE for text specialist runs; queue + poll for image specialists (fal.ai).

## Key file map

### SPA (`src/`)
- `portal-shell.jsx` — top-level shell, workspace switcher, menubar
- `portal-brandolph.jsx` — Brandolph chat surface. **`TEXT_MODELS` / `IMAGE_MODELS` / `RUNNABLE` sets filter which specialists can run.** Must include `fluxSchnell` in `IMAGE_MODELS`.
- `portal-briefs.jsx` — brief list + `BriefRunCanvas` / `BriefViewCanvas`. Hosts `CanvasHeader` (overview/recommendations) above `InteractiveCanvas`.
- `portal-craft.jsx` — craft surface
- `portal-discovery.jsx` — discovery surface
- `portal-admin.jsx` — admin spec editor with version history
- `portal-floater.jsx` — context-aware floater
- `portal-data.js` — client data layer
- `portal-shared.jsx`, `portal-auth.jsx`, `portal-team.jsx`, `tweaks-panel.jsx`, `main.jsx`

### Server (`server/src/`)
- `index.js` — Hono app entry
- `prompt.js` — Brandolph composite system prompt (the six-figure internal blend)
- `routes/`
  - `brandolph.js`, `briefs.js`, `runs.js`, `bios.js`, `discovery.js`, `outputs.js`, `steward.js`, `admin.js`, `inngest.js`
- `lib/`
  - `sharpener.js` — brief → CMO-grade sharpened brief + crew assembly
  - `brandolph-memory.js` — `brand_signals` + `brand_specialist_stats` aggregation
  - `compose-specialist-prompt.js` — merges `CI_SPECIALIST_SPECS` over `CI_DEPT_SPECS` template by seed
  - `compose-image-prompt.js` — image-specialist prompt composition
  - `qa-vision.js` — vision QA via Gemini Flash (~$0.00015/check)
  - `qa-voice.js` — voice QA
  - `load-brand-bio.js`, `assign-steward.js`, `firecrawl.js`, `inngest.js`, `supabase.js`
  - `models/` — `anthropic.js`, `openrouter.js`, `fal-image.js`, `router.js`

### DB (`supabase/migrations/`)
- `20260524183348_init.sql` — initial schema
- `20260524185323_grants_and_admin_rls.sql` — RLS + admin grants
- `20260527000000_brandolph_memory.sql` — `brand_signals` event log + `brand_specialist_stats` aggregate + view

### Scripts (`scripts/`)
- `seed-specs.mjs` — seed/update `CI_SPECIALIST_SPECS`
- `test-router.mjs`, `test-discovery.mjs`, `test-run.mjs`, `test-recovery-link.mjs`, `grant-steward.mjs`

## Model routing (hybrid, cost-optimized)

Routes per specialist tuned to actual cognitive load. External user only ever sees **credits**, never raw API cost.

| Tier | Models | Use |
|---|---|---|
| Text — premium | Anthropic Opus (direct) | Brandolph composite, sharpener, hardest reasoning |
| Text — mid | Anthropic Sonnet (direct), Gemini Pro (OpenRouter), GPT-5 (OpenRouter) | Most specialists |
| Text — cheap | Gemini Flash (OpenRouter), Haiku | Voice QA, vision QA, terse classification |
| Image — premium | Flux, gpt-image, recraft (fal.ai) | Hero KV, editorial |
| Image — cheap | Flux Schnell (fal.ai) | Volume — social posts, mood boards, mockups |

Recent cost pass: ~22 route downgrades (opus→sonnet, sonnet→gemFlash/gemPro/haiku, flux→fluxSchnell). Projected ~57% savings/brand at scale.

## Departments + specialists (55 total)

1. **Strategy** — Positioning Architect, Territory Mapper, Audience Decoder, Commercial Strategist
2. **Concept** — Big Idea, Campaign Concept, Naming, Tagline, Manifesto
3. **Copy** — Headlines, Long-form, Social Captions, Product Copy, Email, Voice QA
4. **Visual** — Hero KV, Editorial Image, Mood Board, Style Frames, Social Post Designer, Ad Creative, Lifestyle, Email Designer, Iconography, Product Mockup
5. **Web & UX** — Landing Page Architect, Component Spec, Microcopy, Information Architecture, Accessibility QA
6. **Motion & Sound** — **GRAYED OUT, marked "coming soon"** (no live specialists yet)
7. **Research & Ops** — Competitive Scan, Trend Watch, Audit, Brief Builder

**Status: 50 of 55 live. Motion & Sound is the deferred dept.**

Spec source of truth: `CI_SPECIALIST_SPECS` per-agent overrides merged over `CI_DEPT_SPECS` template by seed. Editable from `portal-admin.jsx` with version history.

## InteractiveCanvas — non-obvious gotchas

- The canvas wrapper calls `setPointerCapture` and hijacks inner `onClick`. **Always wire node clicks via the `onNodeClick` prop**, not direct `<div onClick>`.
- `CanvasHeader` (overview + tension + dept chips + expandable brief/refusals) sits *above* `InteractiveCanvas` in both `BriefRunCanvas` and `BriefViewCanvas`. Do not remove it — user explicitly demanded it back ("you removed the top of the canvas with the overview and the recommendations").
- The canvas is the MOAT after the BIO. Don't simplify it into a chat thread.

## Brandolph memory

- Event log: `brand_signals` (approve / flag / edit / re-run-premium / re-run-cheap per specialist per brand)
- Aggregate: `brand_specialist_stats` (precomputed counts/rates per brand × specialist)
- View: joined surface for Brandolph runtime crew-assembly + admin UI
- Migration: `supabase/migrations/20260527000000_brandolph_memory.sql`
- Server lib: `server/src/lib/brandolph-memory.js`

## Things that bit us before — do not repeat

- **Forgetting to add `fluxSchnell` to `IMAGE_MODELS` set in `portal-brandolph.jsx`.** Drops every image specialist routed to it from the runnable list — Brandolph silently stops proposing images for social/visual briefs.
- **Removing the CanvasHeader** when refactoring `portal-briefs.jsx`. User notices immediately and is unhappy.
- **Anthropic-only routing** for non-Anthropic-strength tasks. Use OpenRouter for Gemini/GPT-5; fal.ai for images. Always think cost-at-scale + best-result.
- **Workspace dropdown / palette tint experiments.** User reverted those. Don't reintroduce without explicit ask.
- **Calling this project "intelligence" or anything other than CaastorOS.** Hard rule.

## In-flight / pending

- End-to-end live test pass of the `fluxSchnell` + `CanvasHeader` fixes (user-side verification)
- Quality diagnostic for low specialist scores (e.g., Territory Mapper 40/100, Social Captions 10/100 FLAGGED) — not yet diagnosed
- `CaastorOS-Investor-Brief.md` at repo root — investor narrative; framed cost-optimization as moat ("~$170k/month saved at 10k brands") without disclosing internal API economics

## Reference

- Investor brief: `CaastorOS-Investor-Brief.md`
- Implementation log: `docs/IMPLEMENTATION_LOG.md`
- Engineering refinement: `docs/2026-05-24-engineering-refinement.md`
- API + agents plan: `docs/apis-and-agents-plan.md`
- Specialists plan: `docs/specialists-plan.md`
- Modes + templates + steward plan: `docs/2026-05-24-modes-templates-steward-plan.md`

## Dev commands

```sh
npm run dev:all          # SPA on 5173 + API on 8787
npm run dev              # SPA only
npm run dev:server       # API only
npm run seed:specs       # seed/update CI_SPECIALIST_SPECS
npm run test:router      # router smoke test
npm run test:discovery   # discovery smoke test
npm run test:run         # run smoke test
```

Env via `--env-file=server/.env`. SPA env via `.env.local` at repo root.

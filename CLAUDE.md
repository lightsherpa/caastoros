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
- `portal-briefs.jsx` — brief list + `BriefRunCanvas` / `BriefViewCanvas` (Hosts `CanvasHeader` above `InteractiveCanvas`) + **`Library` (folder experience: folder grid → in-folder filter → paper-sheet copy / image thumbnails → forefront viewer with reuse·copy-prompt·download·delete)** + `SpecialistsDirectory`.
- `portal-craft.jsx` — craft surface
- `portal-discovery.jsx` — discovery flow (`DiscoveryStep1`, Extract poll) + **`BioViewer`** (confidence bars, gaps, score) + **new-brand mode** (`newBrand` prop → creates brand then runs discovery)
- `portal-admin.jsx` — admin spec editor with version history
- `portal-floater.jsx` — context-aware floater
- `portal-data.js` — client data layer. Holds `CI_TIERS`, `CI_BRAND_LIMITS` (mirror of server `plan-limits.js`).
- `portal-shell.jsx` — shell + `WorkspaceSwitcher` (**+ Add brand** → `#/discovery/new` or `#/upgrade` by tier), **`UpgradeView`** (`#/upgrade` plan page), route guard, TopBar titles.
- `portal-auth.jsx` — **split sign-in**: story image (left) · access panel (right); **Sign In / Sign Up toggle**; **Continue with Google** (`supabase.auth.signInWithOAuth({provider:'google'})`); email + forgot/recovery preserved.
- `portal-shared.jsx`, `portal-team.jsx`, `tweaks-panel.jsx`, `main.jsx`

### Server (`server/src/`)
- `index.js` — Hono app entry
- `prompt.js` — Brandolph composite system prompt (the six-figure internal blend)
- `routes/`
  - `brandolph.js`, `briefs.js`, `runs.js`, `bios.js`, `discovery.js`, `outputs.js` (incl. `DELETE /:id`), `steward.js` (incl. focus list), `admin.js`, `inngest.js`
  - `brands.js` — **`POST /api/brands`** create-brand, tier-gated (402 `BRAND_LIMIT` when over limit)
- `lib/`
  - `sharpener.js` — brief → CMO-grade sharpened brief + crew assembly
  - `brandolph-memory.js` — `brand_signals` + `brand_specialist_stats` aggregation
  - `compose-specialist-prompt.js` — merges `CI_SPECIALIST_SPECS` over `CI_DEPT_SPECS` template by seed
  - `compose-image-prompt.js` — image-specialist prompt composition
  - `qa-vision.js` — vision QA via Gemini Flash (~$0.00015/check)
  - `qa-voice.js` — voice QA
  - `load-brand-bio.js`, `assign-steward.js`, `firecrawl.js` (+ `mapAndScrape` multi-page), `inngest.js`, `supabase.js`
  - `plan-limits.js` — **single tier-entitlements home**: `BRAND_LIMITS {00:1,01:2,02:3,03:∞}`, `MONTHLY_POOL`, `CRAFT_MIN_TIER='02'` + helpers (`canAddBrand`, `monthlyPool`, `craftEnabled`)
  - `credits.js` — `assertCreditsAvailable` (monthly cap now **resolved from workspace tier** via `monthlyPool`); ledger balance = `-(Σ credits)`, negative row = grant/top-up
  - `score-bio.js` — deterministic BIO score (coverage × confidence × source diversity)
  - `bio-focus.js` — `computeFocus(payload)` Steward focus list (gaps first, then importance × low-confidence)
  - `extract-visual-deterministic.js` — `extractPalette`/`extractFonts` from page CSS ($0)
  - `extract-visual-vision.js` — imagery/avoid via one Gemini Flash call
  - `models/` — `anthropic.js`, `openrouter.js`, `fal-image.js`, `router.js`
- `inngest/functions/compile-bio.js` — Discovery→BIO compiler (see BIO Discovery section)

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

## Plans, tiers & entitlements

- **Tier names (user-facing): `00 The Creek 🏞️` · `01 The Dam 🦫` · `02 The River 🌊` · `03 The Colony 🐜`.** `workspaces.tier` ∈ `'00'..'03'`; `window.CI_TIERS` in `portal-data.js`. (The Colony = enterprise / "Talk to us", not self-serve.)
- **Brand limits per tier** (`plan-limits.js`, canonical): Creek 1 · Dam 2 · River 3 · Colony ∞. Enforced server-side in `POST /api/brands` (402) + client gate in `WorkspaceSwitcher`.
- **Real entitlement gates (approved this session):** credit **monthly pool** and **craft** (human polish, unlocks at The River `'02'`) are per-tier server-enforced. Templates/departments stay marketing labels for now. All read `workspaces.tier` — no Stripe needed.
- **Credits:** monthly cap resolved from tier. "Ran out of credits" = ledger balance ≤ 0 (account was never funded — grant = insert `ledger` row with **negative** credits, `kind:'topup'`). Users see **credits only, never API $**.
- **Billing / Stripe: DEFERRED** (plan at `docs/2026-06-21-billing-upgrade-plan.md`). "The upgrades" = this plan-upgrade/checkout flow. UpgradeView CTAs are stubs; The Colony = "Talk to us"; plan changes are admin-only.

## BIO Discovery (V2) — `inngest/functions/compile-bio.js`

Pipeline (behind `DISCOVERY_V2` env flag; on locally in `server/.env`): **multi-page crawl** (`firecrawl.mapAndScrape`, ≤6 high-signal pages) → **read all `bio_sources`** (URL scrapes + uploaded files + Instagram signal) → **synthesize** (Gemini 2.5 Pro) → **deterministic score** (`score-bio.js`) → **visual extraction** (CSS palette/fonts $0 + one Gemini Flash imagery/avoid) → write `bios` (uncertified) → enqueue Steward.
- **Confidence is a SIBLING map**, not nested: `payload.confidence["<section>.<key>"] = {conf 0-100, source}`. Keeps every value a plain string so `prompt.js` / `sharpener.js` / `compose-specialist-prompt.js` and the Vinilo seed read unchanged — no unwrap shim, no migration.
- `payload.missing[]` = gaps ("we'll tell you what we couldn't find"). Brand refusals → `brands.refusals` (only when empty). Steward focus list via `bio-focus.js`.
- New BIO shape is **additive & read-tolerant** — old BIOs (bare strings, no confidence/missing) still render.

## Auth / login

Split sign-in with **Sign In/Sign Up toggle** + **Continue with Google** (`portal-auth.jsx`). Google needs one-time config (NOT in our code — Supabase holds the secret): Google Cloud OAuth Web client (redirect `https://yemzrohzqfuxmekcgnnh.supabase.co/auth/v1/callback`) → Supabase Auth → Providers → Google → add app URLs to redirect allowlist. Story image at `public/caastor/assets/login-story.png` (swappable). Text-over-photo uses a guaranteed dark scrim (`.auth-story__copy`) — axe-core AA clean.

## Assets

Served static assets live in **`public/caastor/`** (Vite serves `public/` at root → `/caastor/...`). The old `intelligence/` folder was renamed to `caastor/` (hard naming rule). Root `intelligence/` is a dead untracked dup — ignore.

## Things that bit us before — do not repeat

- **Forgetting to add `fluxSchnell` to `IMAGE_MODELS` set in `portal-brandolph.jsx`.** Drops every image specialist routed to it from the runnable list — Brandolph silently stops proposing images for social/visual briefs.
- **Removing the CanvasHeader** when refactoring `portal-briefs.jsx`. User notices immediately and is unhappy.
- **Anthropic-only routing** for non-Anthropic-strength tasks. Use OpenRouter for Gemini/GPT-5; fal.ai for images. Always think cost-at-scale + best-result.
- **Workspace dropdown / palette tint experiments.** User reverted those. Don't reintroduce without explicit ask.
- **Calling this project "intelligence" or anything other than CaastorOS.** Hard rule.
- **"Growth Hub" is NOT part of CaastorOS.** It's a separate portal the user is building; it kept appearing in the working tree via parallel work. If `portal-growth.jsx` / `routes/growth.js` / `growth_os` migration / `.growth-*` CSS / a `hub` icon / a `growth` nav item reappear — remove them. Extracted code lives at `../caastoros-growth-extracted/`. 8 orphaned `growth_*` DB tables remain (left intentionally — don't drop without asking).
- **Discovery Extract freeze:** the poll's advance must fire `onDone` UNCONDITIONALLY — don't gate it on the `alive` flag you just set false (that froze the flow at "done" when the BIO landed before the 90s fallback).
- **Undeclared vars in the run-completion node update** (`portal-briefs.jsx` `BriefRunCanvas`) → `ReferenceError` mid-run. A stray `cost,` shorthand crashed it; only `text/qa/done/assetUrl/tokenCount` exist. (And never surface API `cost` — credits only.)
- **`WorkspaceSwitcher` must refetch on `brand:changed`** or a newly-created brand won't appear until reload.
- **Dev stack:** run `npm run dev:all` (concurrently). Do NOT run `npm run dev` (vite) standalone in a background shell — it exits on stdin-EOF; concurrently holds the pipe open. Background processes don't survive a session-end teardown.

## In-flight / pending

- **Google OAuth:** button is wired; needs the one-time Supabase + Google Cloud config (see Auth section) before it works.
- **Billing/Stripe:** deferred (`docs/2026-06-21-billing-upgrade-plan.md`). Entitlement enforcement (credit pool + craft) is live without it.
- **Reuse action** (Library viewer) stashes to `sessionStorage` but Create doesn't consume the seed yet — small wire-up left.
- **SPA credits widget** (`CI_CREDITS`, "/900") is still mock — wire to live balance when convenient. The server gate IS real.
- Orphaned `growth_*` DB tables — clean up when the separate growth portal is stood up.
- Quality diagnostic for low specialist scores (Territory Mapper, Social Captions) — still not diagnosed.

## Git / state

Branch `feature/image-quality-overhaul`, **no git remote**. Session work committed (`3aa210c`, `906519c`, …). `explainer-video/` (664 MB media) + `intelligence/` (dead dup) are gitignored / excluded.

## Reference

- BIO discovery overhaul plan: `docs/2026-06-21-bio-discovery-overhaul-plan.md`
- Billing / plan-upgrade plan: `docs/2026-06-21-billing-upgrade-plan.md`
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
npm run test:units       # node --test on pure libs (plan-limits, score-bio, bio-focus, extract-visual, …)
npm run test:router      # router smoke test
npm run test:discovery   # discovery smoke test
npm run test:run         # run smoke test
```

Env via `--env-file=server/.env`. SPA env via `.env.local` at repo root. Discovery V2 pipeline gated by `DISCOVERY_V2=1` in `server/.env`.
JSX parse-check (no full build): `npx esbuild <file>.jsx --bundle --format=esm --outfile=/dev/null --loader:.jsx=jsx --external:react --external:react-dom`

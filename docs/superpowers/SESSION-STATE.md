# CaastorOS — Session State / Resume Note (2026-06-05)

> Read this + `CLAUDE.md` to resume. All work below is **committed to git**.

## What was built this session (the "canvas → human craft" arc)

**Backend (Plans 1 & 2 — server, fully unit-tested, `npm run test:units` = green):**
- **Delivery Plan contract** — `server/src/lib/{platforms,taxonomy,delivery-plan,deliverables}.js`. The Sharpener (`server/src/lib/sharpener.js`) now emits a structured `deliveryPlan` (typed deliverable groups: count + platforms + parts + crew, incl. **visual** specialists) instead of a flat text-only list. Specs: `docs/superpowers/specs/2026-05-31-canvas-delivery-plan-design.md`. Plans: `docs/superpowers/plans/`.
- **Run engine** — `server/src/routes/runs.js` is deliverable-aware: one specialist call returns **N structured, per-item-QA'd deliverables**; killed the `maxTokens = cr×100` truncation; images sized per platform; persists a `deliverables` JSON array on the output row. Fully back-compatible (no `deliverableSpec` → legacy single-blob).
- **Caption model fix** — `a16` Social Captions moved `haiku → sonnet` in `src/portal-data.js` + re-seeded (`npm run seed:specs`). Fixed bad captions + JSON-leak.
- **Parser hardening** — `deliverables.js parseDeliverables` guarantees raw JSON never reaches a card.

**Canvas (client — `src/portal-briefs.jsx`):**
- Fan-out: deliverable runs spawn **child cards branching off the specialist** (tidy grid, clickable — the click-blocking container box was removed).
- **Click a card → `DeliverableDrawer`** (uses shared `<Drawer>`) with full content + Copy/Export.
- **Click the Brief node → `BriefDrawer`** (tension, sharpened brief, refusals = "what we won't do", what's being produced).
- **BriefViewCanvas** (saved briefs): dedupes specialists (fixed the duplicate-`spec-a41` key crash) + **rebuilds deliverable cards on reopen** + reads persisted craft state.
- Per-slot image pairing (each caption gets its own BIO-driven image).

**Sharpening (`src/portal-brandolph.jsx`):** questions are **stacked compact cards** (question + one-line `solvingFor` reflection + answer). Sharpener emits `solvingFor` per question.

**Human handoff ("Send to human") — backend + UI, COMMITTED:**
- `server/src/routes/craft.js` (mounted at `/api/craft` in `index.js`): `POST /` (create job on the deliverable JSON + ledger debit), `GET /queue`, `PATCH /deliver`. **No new table** — the job lives in `output.body.deliverables[slot].craft` (couldn't run migrations from the CLI here).
- Canvas: "Send to human · 40 cr" → a **"brief the human" form** (notes + quick chips) → Confirm → `POST /api/craft`, card flips to ✦ IN HUMAN CRAFT, **persists across reopen**.
- Team portal: new **"Craft polish"** view (`CraftQueue` in `portal-team.jsx`, route `team-craft` in `portal-shell.jsx`) — human sees the piece + operator's brief, refines, `PATCH /api/craft/deliver` → polished version lands back on the card.

## Untested / open (verify when you resume)
- **End-to-end live test of the craft loop** was handed to the user, not confirmed: send → reopen (persist) → Team "Craft polish" → deliver → reopen (polished). The "Craft polish" nav only shows in the **Team portal** (may need `npm run grant:steward`); endpoints are `requireAuth` only, so send+persist work regardless.
- The header top-clip (canvas height `calc(100vh - 56px)` slightly exceeds viewport → scrolls a few px) — diagnosed, **NOT fixed** (one-line `overflow` change, left alone per "respect what's there").
- Credit model: send-to-human debits a flat 40 cr client-side + a ledger row; reconciliation with `estimateCr` (count × platforms) is a TODO noted in `runs.js`.
- A dedicated `craft_jobs` table is the clean-up if you want better queue queries (needs a migration applied via the Supabase dashboard — can't be done from this CLI env).

## Standing rules (from CLAUDE.md — do not violate)
Don't change flow/features without verifying first · focus only on the ask · cost-optimize APIs at scale · only show **credits** to users (never raw API cost) · the canvas is the MOAT (after the BIO) — additive only, don't simplify · call it **CaastorOS**.

## Gotcha that cost hours this session
`src/portal-briefs.jsx` has **mixed exports**, so Vite **full-page-reloads** on every edit — editing it while the user is mid-run **wipes the canvas**. Don't live-edit it during an active run; make the change, then have them hard-refresh + re-run.

## Dev
`npm run dev:all` (SPA :5173 + API :8787, API under `--watch`). `npm run test:units` (server unit tests). `npm run seed:specs` (after CI_AGENTS model changes).

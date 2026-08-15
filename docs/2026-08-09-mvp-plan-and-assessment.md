# CaastorOS — Technical Assessment & 2-Week MVP Plan

**Author:** Hopper (CTO) · **Date:** 2026-08-09 · **Ship target:** 2026-08-23
**Issue:** CAA-38 · **Reviewed on branch:** `feature/image-quality-overhaul`

---

## 0. TL;DR — the decision ask

CaastorOS is a **real, above-average-for-stage product**, not a prototype. It **builds clean, tests green (103/0), and can deploy today**. The full core loop — Discovery → BIO → brief → sharpen → specialist run → QA → interactive canvas — exists end-to-end and has a real e2e test that exercises it.

**This is not a rewrite. The 2-week MVP is a hardening + integration sprint**, not new-feature construction. The scope below closes the handful of correctness/security gaps that would embarrass us in front of a paying pilot, wires the last user-facing verification step on the canvas, kills the bundled placeholder data, and fixes branch hygiene — while protecting the BIO → brief → verify → canvas moat.

I need the CEO to (a) approve the MVP cut line and (b) make **3 decisions** (§8) that change scope: pilot billing mode, prod BIO-cert enforcement, and infra spend. Everything else I can direct Ada on immediately upon approval.

---

## 1. Current shippable state

**Verified this session:**
- `npm run test:units` → **103 pass / 0 fail**.
- `npm run build` → **clean** (one 812 KB JS chunk, gzip 226 KB — a perf note, not a blocker).
- `npm run test:e2e` exists and drives the real loop (Discovery → BIO self-cert → sharpen → run → output) with free-preflight and per-phase modes.
- Deploy is real: `render.yaml` + `docs/mvp-deployment.md` describe a coherent single-origin deploy (Hono serves `../dist` + SPA fallback, `/api/*` wins first, `/healthz` present, secrets via `sync:false`). Custom domain `app.getcaastor.co`.

**What works well (keep):**
- Clean model-routing abstraction (`server/src/lib/models/router.js`): per-spec `modelRouting`, one normalized event shape, Anthropic prompt-caching lever correctly isolated to the direct adapter. **Cost-at-scale is genuinely implemented.**
- Consistent tenant-isolation checks on every brand-scoped route (`brand.workspace_id === workspaceId`), even though the server runs as service-role.
- Thoughtful BIO tier-1/tier-2 certification model; `load-brand-bio.js` refuses to serve another brand's BIO.
- QA fails **safe** (voice fail-open to local-only; vision → flagged, never auto-approves on error).
- Interactive canvas is a solid, self-contained pan/zoom/drag engine; `CanvasHeader` intact; regression guards hold (`fluxSchnell` ∈ `IMAGE_MODELS`).
- App-level error boundary with recover + clear-session path (no white-screen deaths). Clean secret posture (anon key only in the browser; service role server-only; no committed `.env`).

**Branch / integration hygiene — the headline finding:**
- `main` is a **strict ancestor** of every feature branch (behind 0). The real product lives on `feature/image-quality-overhaul` (**42 commits ahead of main**), which Render deploys directly.
- `feature/image-quality-overhaul` already **fully contains** `caa-26`, `caa-27`, and `feature/replit-ux`. Only `caa-33` (Ada's teardown, 1 unique commit) and `origin/caa-28` (1 unique commit, already merged as `6a09749`) carry unique work. `archive/overhaul-wip` (8 commits) is an archive — ignore.
- **Because `main ⊆ feature/image-quality-overhaul`, promoting to trunk is a fast-forward with zero conflict risk.** Deploying from a long-lived feature branch while `main` rots is the one hygiene problem, and it's cheap to fix (§4).
- No CI (`.github/workflows` absent). Working tree has 3 uncommitted dev-tooling changes (`make-test-client.mjs` + its npm script + a QA-checklist edit) — harmless, should be committed so they aren't lost.

---

## 2. Risks, ranked (severity × likelihood)

Grouped; each item has effort (S/M/L), file anchor, and owner. Cross-referenced to issues in §6.

### A. Credits integrity — **P0, highest** (free compute / negative balance)
1. **Non-atomic debit (TOCTOU).** Balance is checked at `runs.js:92` but debited only after streaming completes (`runs.js:393`). Concurrent/rapid runs all pass the same pre-check → balance goes **negative = free work**. No lock, no transaction, no `unique(run_id)` on the ledger; `balance_after` is a stale snapshot. Negative balance already observed historically (`new_workspace_credit_grant.sql` header: "-36"). **(M)**
2. **Unmetered expensive endpoints.** `/brandolph/ask` (Sonnet, **unbounded `messages`**), `/briefs/sharpen` (Sonnet), `/discovery/start` (Firecrawl crawl + Gemini Pro + Flash + vision) have **no credit check and no rate limit** — a user burns unlimited API spend for zero credits. **(M)**
3. **Upgrade grants no credits.** Stripe webhook only sets `workspaces.tier` (`billing.js:73`); no ledger top-up and **no monthly-refill job exists**. Paying raises the cap but never adds spendable credits. Product bug **if** billing goes live. **(M)**

### B. Cost / security leaks — **P0** (violates hard rules, small fixes)
4. **Internal cost leaks to the browser.** `runs.js:326` emits the `qa` SSE event carrying `qa.usage.cost_usd` (accumulated at `:319`), and the `done` event (~`:470`) re-embeds the full `qa` object — so `cost_usd` + provider/model IDs (`gemini-2.5-flash`, etc.) reach the client. **Directly violates the "credits only, never raw cost" rule.** The `done.usage` block was whitelisted but still ships provider/model. **(S)**
5. **Inngest endpoint unauthenticated if key unset.** `serve({ signingKey: process.env.INNGEST_SIGNING_KEY })` (`routes/inngest.js`). If the key is missing in prod, `POST /api/inngest` is **unauthenticated function invocation** — anyone can trigger `compile-bio` and burn Firecrawl+LLM spend. **(S)**
6. **Security-definer view leak.** `brand_specialist_stats_view` (`brandolph_memory.sql:94`) is a default security-definer view with no workspace filter, and `grant all on all tables … to anon, authenticated` (`grants:26`) is over-broad. Any logged-in user can read **every brand's** specialist stats via the Supabase REST endpoint. Low-sensitivity data but a real isolation break + advisor finding. **(S)**

### C. Resilience — **P1** (breaks under a bad provider / load)
7. **No upstream timeouts.** No AbortController on any model or Firecrawl fetch (`openrouter.js:76`, `anthropic.js` stream, `firecrawl.js:16`). A hung provider holds the SSE connection open indefinitely. **(S/M)**
8. **Silent Discovery failure.** If `compile-bio` exhausts retries (persistent non-JSON, `compile-bio.js:311`), no `bios` row and no user notification — the brand is stuck "queued" forever. No Inngest `onFailure`. **(M)**
9. **Non-idempotent scrape step.** V2 scrape inserts one `bio_sources` row per page and can throw mid-loop (`compile-bio.js:161-173`); Inngest retries the whole step → duplicate source rows. **(S)**

### D. Frontend fragility — **P1/P2** (moat protection + maintainability)
10. **`portal-briefs.jsx` is one 4094-line god-file** (InteractiveCanvas + Run + View + CanvasHeader + library + drawers), with **two divergent `renderNode` copies** that must be hand-synced — a documented recurring regression source. Full split is post-MVP; targeted extraction + dedup is in scope via CAA-29. **(L full / M targeted)**
11. **Canvas correctness bugs.** Height-measure effect runs once on `[]` mount (nodes added later keep default 66px → wrong edge anchors); `fitView` does `Math.min(...nodes.map())` with **no empty guard** → NaN view if nodes empty. **(S)**
12. **Specialist catalog drift.** Canvas resolves specialists from the static `window.CI_AGENTS` bundle while admin edits specs via API — they **will drift**, and a live `specialist_id` missing from `CI_AGENTS` yields `undefined` → render can throw. Needs a safe unknown-agent fallback (part of CAA-30). **(M)**
13. Client role gating is presentation-only (redirect, skipped during `_pending`). **Acceptable only because** the server/RLS is the real gate — confirmed server-side authz is sound. UX note, not a hole. **(S)**

### E. Deploy softness — **P1** (intentional-vs-accidental)
14. **Render free plan** spins down → cold starts drop Inngest/Stripe webhooks + Realtime. **(M, infra/CEO)**
15. **Deploys from a feature branch, not `main`; one service, no staging/prod split;** `.env.example` suggests prod and dev **share one Supabase project** — migrations get tested against prod. **(M, infra/CEO)**
16. **`render.yaml` omits `STRIPE_*`** → billing is silently 503 in prod, and **`REQUIRE_HUMAN_CERT` defaults to 0** → the "senior-certified BIO" gate is **OFF** in the shipped config. Both may be deliberate soft-launch choices — they need to be *intentional* (§8). **(S)**

---

## 3. MVP cut line

**Definition of "shippable MVP" (2026-08-23):** an invite-only pilot where a real client can sign in, build a BIO from their URL, run BIO-grounded briefs, see output on the interactive canvas, approve/request-changes and send-to-human, and spend credits — with **no free-compute holes, no internal-cost leakage, no cross-tenant leaks, and no bundled fake data on the core surfaces**, deployed from `main` on paid infra.

### IN (protect + finish)
- Auth, workspaces, brands, tier gating (exists).
- Discovery → BIO (tier-1 self-cert) → brief → sharpen → specialist run (text + image) → QA → **interactive canvas** (exists; harden).
- Canvas: view/interact, Send-to-human/craft (exists) **+ user Approve / Request-changes toolbar** (CAA-29) — the last user-facing verify step.
- Credits: **atomic debit** + **metered expensive endpoints** (P0-A).
- Human verification (MVP form): Steward BIO certification (exists) + user output approve on canvas. **BIO "learning" stays as the memory-signal loop** feeding the sharpener (exists).
- Live data on core surfaces (kill `CI_*` placeholder) with real empty states (CAA-30, core surfaces).
- Security/cost hardening: cost-leak closed, Inngest key asserted, view leak closed, upstream timeouts (P0-B, P1-C).
- Deploy: single service on `main`, Render **paid**, staging/prod Supabase split, secrets intentional.

### OUT (explicitly deferred, post-MVP)
- **Motion & Sound department** (already deferred — no live specialists).
- **Full reviewer queue + rubric engine + automatic BIO canon writeback** (CAA-7 in full). MVP keeps Steward cert + canvas approve + memory-signal learning; the standalone reviewer-queue product is the future Verification/QA hire's area.
- **Self-serve Stripe billing live** — pilot uses manual invoicing (CAA-20) **unless** CEO decides otherwise (D1). Monthly credit-refill job deferred with it.
- **`REQUIRE_HUMAN_CERT` prod enforcement** unless the steward bench is seeded (CAA-37, D2).
- **Full `portal-briefs.jsx` split** and **route-level code-splitting** — targeted extraction only.
- **PostHog decision (CAA-23) / full funnel (CAA-21)** — growth track, runs in parallel, not on the ship critical path.

**Non-negotiable guardrails during the sprint:** keep the app deployable every day; do not remove `CanvasHeader`; keep `fluxSchnell` ∈ `IMAGE_MODELS`; never surface raw API cost; no reintroduction of reverted experiments (workspace dropdown / palette tint); no product-flow/feature changes without CEO sign-off.

---

## 4. Branch & integration hygiene plan

1. **Commit** the 3 stray working-tree changes (dev tooling) on the current branch.
2. **Land Ada's CAA-33** (the 1 unique commit) into `feature/image-quality-overhaul`.
3. **Fast-forward `main` → `feature/image-quality-overhaul`** (zero-conflict; `main ⊆ branch`). `main` becomes the trunk of record.
4. **Retarget Render** `branch:` from `feature/image-quality-overhaul` → `main`.
5. **Adopt short-lived branches off `main`** for every issue below; I review + merge; delete on merge. No more long-lived divergent branches.
6. **Add a minimal CI gate** (GitHub Actions: `npm ci && npm run test:units && npm run build`) so `main` stays releasable. (S — Hopper.)
7. Delete/close the merged branches (`caa-26/27/28`, `replit-ux`) after promotion; keep `archive/*` as-is.

---

## 5. Dated 2-week plan

Start Sat 2026-08-09 · Ship Sat 2026-08-23. Owners: **Ada** = eng execution, **Hopper** = arch/review/integration + CI, **Brandolph/infra** = ops flips (no agent has prod DB/env access per CAA-37), **Ellis** = growth (parallel).

| Window | Dates | Focus | Owner | Exit criteria |
|---|---|---|---|---|
| Setup | Sat–Sun Aug 9–10 | Assessment (this doc), branch promotion to `main`, CI gate, issue creation, unblock Ada | Hopper | `main` = trunk; Render on `main`; CI green; issues filed |
| Week 1 | Mon–Fri Aug 11–15 | **P0 hardening**: atomic credits (I-1), cost-leak (I-2), boot assertions (I-3), meter/rate-limit (I-4), timeouts (I-5), view-leak (I-6). Land CAA-33. | Ada (build), Hopper (review) | No free-compute path; no cost leak; Inngest/secret fail-closed; units+e2e green |
| Mid checkpoint | Fri Aug 15 | Deploy hardened build to a **staging** service; run `test:e2e` preflight against staging | Hopper + infra | Staging up on paid plan, separate Supabase |
| Week 2 | Mon–Fri Aug 18–22 | **Core-loop finish**: canvas Approve/Request-changes + renderNode dedup (CAA-29), CI_* → live data core surfaces (CAA-30), discovery failure path (I-7), canvas robustness (I-8) | Ada (build), Hopper (review) | Verify step live on canvas; no bundled fake data on core surfaces; discovery never silently stuck |
| Ship | Fri–Sat Aug 22–23 | Manual QA pass (`docs/manual-qa-checklist.md`), full `test:e2e`, prod cutover from `main`, pilot invite | Hopper + Brandolph | Green checklist; pilot client can complete the loop end-to-end in prod |

**Parallel, non-blocking (do not gate ship):** CAA-37 (prod cert flip, Brandolph/infra), CAA-31 (repoint workspace, board), CAA-20 feasibility numbers (Ada+Hopper → Ellis), growth track (CAA-13/14/33 teardown wedge, Ellis).

**Buffer/risk:** ~2 days of slack are built into the weekends. If Week 1 P0 slips, CAA-30 (full CI_* migration) is the first thing to trim to core surfaces only; the canvas verify toolbar (CAA-29) and all P0 items are non-negotiable.

---

## 6. Issue breakdown (created on approval — assigned to Ada unless noted)

**P0 — Week 1**
- **I-1 · Credits: atomic debit RPC** — Postgres RPC with row-lock (or reserve-then-settle), `unique(run_id)` on ledger, `balance >= 0` guard. Kills TOCTOU/negative balance. *(M)* — refs `runs.js:92,393`, `credits.js`.
- **I-2 · Close internal-cost leak to client** — sanitize `qa` before the `qa` SSE event and inside `done`; strip `cost_usd` (+ provider/model unless product-needed). *(S)* — refs `runs.js:326,~470`. **Hard-rule fix.**
- **I-3 · Fail-closed boot assertions** — require `INNGEST_SIGNING_KEY` (+ Stripe secrets when billing on) at boot in prod; refuse to start otherwise. *(S)* — refs `routes/inngest.js`, `index.js`.
- **I-4 · Meter + rate-limit expensive endpoints** — credit-debit + per-workspace rate limit on `brandolph/ask`, `briefs/sharpen`, `discovery/start`; cap `messages` length. *(M)*
- **I-6 · Close security-definer view leak** — recreate `brand_specialist_stats_view` with `security_invoker=true` (or workspace filter); replace blanket `grant all … to anon` with explicit per-table grants. *(S)* — DB migration.

**P1 — Week 1→2**
- **I-5 · Upstream timeouts/AbortController** on all model + Firecrawl adapters. *(S/M)*
- **I-7 · Discovery failure path** — Inngest `onFailure` notifies brand owner + marks state; make scrape step idempotent (upsert `bio_sources`). *(M)*
- **CAA-29 · Canvas Approve/Request-changes toolbar + renderNode dedup** — server-side user-approval state (separate from QA verdict) + canvas toolbar; dedup the two `renderNode` copies. *(M)* — **existing issue, promote to P1.**
- **CAA-30 · Migrate core demo surfaces off `CI_*` → live Supabase + empty states** (incl. safe unknown-agent fallback for the canvas catalog). Scope to **core surfaces** for MVP. *(M)* — **existing, unblock.**
- **I-8 · Canvas robustness** — re-measure on `nodes` change; `fitView` empty guard. *(S)* — refs `portal-briefs.jsx` canvas engine.

**Infra / CEO-owned (parallel)**
- **I-9 · Deploy hardening** — Render paid plan; separate staging/prod Supabase; wire Stripe env per D1. *(M)* — needs D3.
- **CAA-37 · Prod human-cert enforcement** — decision + steward-bench seed + re-cert backlog. *(Brandolph/infra)* — needs D2.
- **CAA-31 · Repoint Paperclip workspace → `lightsherpa/caastoros`** — *(board/platform)*.
- **Trunk + CI** — promote to `main`, retarget Render, add Actions gate. *(Hopper)*

---

## 7. Coordination with Ada / in-flight work

- **Ada is idle**; her one live in-flight item is **CAA-33 (BIO Teardown v0, `in_review`)** — the growth wedge, 1 commit on `caa-33`. **I will fold it in, not disrupt it:** land it into trunk during Setup, then Ada picks up the P0 queue. I will not touch the teardown surface myself.
- Ada has **no prod DB/env access** (per CAA-37) — so all ops/infra flips are CEO/infra-owned; I've scoped Ada's issues to code only.
- I'll review every PR (correctness/security/simplicity), keep decisions unambiguous, and pair on the atomic-credits RPC (the one item with real concurrency subtlety).
- **CAA-20** (Ellis's feasibility gate) — Ada + I will provide the throughput/verification-capacity numbers so Ellis can finalize pricing without over-promising.

---

## 8. CEO decisions required (bind to this confirmation)

Approving this plan = approving the §3 cut line **and** these three calls (each changes scope; I need them to sequence Week 1):

- **D1 — Pilot billing mode.** *Recommend:* **manual invoicing** for the founding cohort (CAA-20), Stripe checkout gated off but code-ready. *Alternative:* Stripe live now — adds credit-grant-on-upgrade + monthly-refill scope (~+2–3 days) and requires payment-data sign-off.
- **D2 — `REQUIRE_HUMAN_CERT` in prod.** *Recommend:* **OFF for soft-launch** (tier-1 self-cert serves; canvas approve + Steward review still available), revisit once the steward bench is seeded (CAA-37). *Trade-off:* the "senior-human-certified BIO" claim is not literally enforced in the shipped config until we flip it. If you want it ON at ship, CAA-37 becomes a ship blocker and needs infra to seed stewards + clear the re-cert backlog.
- **D3 — Infra spend.** *Recommend:* **approve** Render paid plan + a **separate staging Supabase project** (stops prod/dev DB sharing and cold-start webhook drops). Small recurring cost; this is an infra/billing commitment I won't make without your sign-off.

---

## 9. Verification strategy

Smallest check that proves each change, per the standing rule:
- Unit suite (`npm run test:units`, 103 tests) on every PR + CI gate; add tests for the atomic-credit RPC (concurrency), the cost-leak sanitizer, and the discovery failure path.
- `npm run build` in CI.
- `npm run test:e2e` (free preflight + targeted phases) against **staging** at the mid-week checkpoint and before cutover — this is the real loop end-to-end.
- `docs/manual-qa-checklist.md` pass before ship (it already flags the renderNode duplication CAA-29 fixes).
- Post-fix spot check on the two hard-rule guards (no `cost_usd` in any client payload; `fluxSchnell` still runnable; `CanvasHeader` present).

---

*Prepared by Hopper (CTO). On approval I will promote to trunk, file the issues above, and start Ada on the Week-1 P0 queue.*

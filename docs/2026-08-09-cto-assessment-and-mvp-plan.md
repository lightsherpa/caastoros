# CaastorOS — CTO Codebase Assessment & 2-Week MVP Plan

**CAA-38 · Hopper (CTO) · 2026-08-09 · ship target 2026-08-23**

> This is a hardening + trust + hygiene sprint, not a build-out. CaastorOS is a real,
> mostly-working product. The MVP is: deploy from a real trunk, run entirely on live
> data, and put a human-verification gate in front of delivery. Cut billing automation
> and non-core surfaces.

---

## 1. Executive read

CaastorOS is substantial and mostly working — not a prototype. The build is clean, the
unit suite is green, and the core loop (BIO → brief → generate → verify → canvas) runs
end-to-end in prod today. The 2-week MVP is therefore **hardening**, not new features.

**Verified ground truth (2026-08-09, this machine):**

- `npm run build` → **clean** (single 812 KB / 226 KB gzip bundle; code-splitting is a
  nice-to-have, not a blocker).
- `npm run test:units` → **103 pass / 0 fail** across 17 unit modules.
- Footprint: **~13.3k LOC SPA + ~6.2k LOC server** (52 server files) + 5 migrations + 37 test files.
- Deploy: **Render** web service (`render.yaml`), domain `app.getcaastor.co`, `/healthz`
  health check, all secrets `sync:false`. **Deploys from `feature/image-quality-overhaul`,
  not `main`.**

## 2. What works — keep and protect

- **BIO authoring (Discovery→BIO), `DISCOVERY_V2=1`, end-to-end in prod:** URL + IG +
  3-bucket uploads + intake → `compile-bio` (Inngest) → Firecrawl multi-page crawl →
  Gemini 2.5 Pro synthesis → Flash evidence verifier → deterministic visual extraction →
  versioned `bios` row → `brands.refusals` → Steward job. APIs properly wired; the CAA-24/25
  audit found no dead/legacy API wiring.
- **brief → generate:** sharpener + crew assembly + 50 live specialists; hybrid,
  cost-optimized routing (Anthropic / OpenRouter / fal.ai); SSE for text, queue+poll for images.
- **Interactive canvas (the moat):** write-paths repaired (CAA-27 — send-to-human, re-run,
  interactions); `CanvasHeader` intact.
- **Tier-2 (human) BIO certification:** coded and reversible (CAA-25); enforcement is a prod env flip.
- **Brandolph briefing prompts hardened** (CAA-26 — crash-guard, crew-count truth, persona).

## 3. Risks / fragility (ranked)

- **R1 — Branch & deploy hygiene (highest).** `main` is frozen at **2026-06-02**; every
  feature branch is 26–42 commits ahead and 0 behind. The real trunk is
  `feature/image-quality-overhaul` (has already absorbed caa-26, caa-27, replit-ux).
  **Render deploys prod straight off a feature branch** — `main` does not represent
  production. One branch (`caa-33`, BIO Teardown v0, 1 commit, in_review) is still
  outstanding. → Promote trunk→`main`, repoint Render to `main`, land caa-33.
- **R2 — Live-data integrity (CAA-30, blocked).** 5 SPA surfaces still render bundled
  `CI_*` placeholder data as a fallback (library/brief detail, craft/steward ledger,
  team queue, specialists drawer, canvas seed graph). A pilot customer could see scaffold
  data. → Wire the MVP-path surfaces to live Supabase + real empty states.
- **R3 — Verification gate not enforced end-to-end (core-loop gap; CAA-7 backlog).** The
  "verify" half of the moat loop — per-deliverable approve/reject + "nothing reaches a
  customer unverified" — is not built as a gate. BIO-level steward cert (CAA-25) and canvas
  send-to-human/re-run (CAA-27) exist; the delivery gate + feedback-to-BIO write-back do
  not. → Ship a pragmatic slice for MVP; full rubric/scoring is the Verification hire's phase 2.
- **R4 — No CI.** Build/tests are green locally but nothing gates merges to the branch
  Render deploys. → Minimal GitHub Actions gate (build + `test:units`).
- **R5 — Tier-2 enforcement off in prod (CAA-37, blocked on infra/people).**
  `REQUIRE_HUMAN_CERT=1` 409s every run until a steward bench is seeded + the legacy
  self-cert backlog is cleared. Owner: Brandolph/infra, **not eng**.
- **R6 — No README.** Minor; add a short run/deploy README for future hires.

## 4. Security posture (quick pass; deeper review on QA day)

- Secrets `sync:false` in Render (not committed) — good. Service-role key server-only.
- RLS + admin-grants migration exists.
- To verify on QA day: service-role never reaches the client bundle; `ALLOWED_ORIGINS`
  enforced; **no internal API cost surfaced anywhere (credits-only)**.

## 5. MVP cut line (explicit)

**IN — the trustworthy core loop, live and deployed:**

1. Trunk→`main` promotion + Render on `main` + minimal CI gate + land caa-33.
2. Live-data on core-loop surfaces (CAA-30 subset): brief detail/library, canvas graph,
   specialists drawer, steward/team queue.
3. Human-verification MVP slice: per-deliverable approve/request-changes on canvas +
   "nothing delivered unverified" gate + BIO-level steward cert wired into the flow
   (pragmatic CAA-7).
4. Tier-2 enforcement ON in prod (CAA-37 — Brandolph/infra track).
5. One real pilot brand run end-to-end; **manual (founding-customer) billing**; credits
   display sane.
6. QA + security pass (manual-qa-checklist + smoke/e2e green) + short deploy README.

**OUT — deferred past MVP (explicit):**

- Billing/subscription automation (CAA-8) → manual founding-customer billing.
- Full CAA-7 rubric scoring engine + automatic BIO write-back → Verification/QA hire, phase 2.
- Motion & Sound dept (already deferred).
- CAA-29 canvas approve/reject *toolbar polish* + renderNode dedup.
- Image-gen expansion (CAA-22) beyond what's live.
- Heavy funnel instrumentation / PostHog self-host decision (CAA-21 / CAA-23).
- BIO Teardown wedge beyond landing caa-33 (growth track, Ellis-owned, parallel — not a
  core-loop MVP blocker).

## 6. Dated 2-week plan (2026-08-09 → 2026-08-23)

Owners: **Ada** = eng exec · **Hopper** = architecture/review · **Brandolph** =
infra/ops/scope · **Ellis** = growth (parallel).

### Week 1 — make it real & deployable

| Dates | Work | Owner | Issue |
|---|---|---|---|
| Aug 9–10 | Trunk hygiene: promote `feature/image-quality-overhaul`→`main`; repoint Render to `main`; add CI (build + `test:units`); land caa-33 | Ada / Hopper review | new: CAA-39 |
| Aug 11–13 | CAA-30 live-data migration for core-loop surfaces + real empty states | Ada | unblock CAA-30 |
| Aug 13–15 | Verification MVP slice: canvas approve/request-changes + delivery gate + steward-cert wired | Ada / Hopper | new: CAA-40 (scoped from CAA-7) |
| Aug 15 (start) | Tier-2 enforcement prereqs in prod (seed steward bench, clear self-cert backlog) | Brandolph / infra | CAA-37 |

### Week 2 — harden, verify E2E, ship

| Dates | Work | Owner | Issue |
|---|---|---|---|
| Aug 16–18 | End-to-end pilot dry run on real brand data; fix breakage; confirm feedback→BIO write path | Ada / Hopper | new: CAA-41 |
| Aug 19–20 | Pilot onboarding/accounts polish; manual billing runbook; credits sanity | Ada | new: CAA-42 |
| Aug 21–22 | QA + security pass (manual-qa-checklist, smoke/e2e, secrets/RLS, credits-only); short README | Hopper lead / Ada | new: CAA-43 |
| Aug 23 | Production ship from `main`; flip `REQUIRE_HUMAN_CERT=1`; one pilot brand live; go/no-go w/ CEO | Hopper + Brandolph | ship gate |

**Critical path:** Aug 9–10 hygiene → Aug 11–13 live-data → Aug 13–15 verify gate →
Aug 16–18 E2E → Aug 23 ship. Billing automation and the full rubric are explicitly off the path.

## 7. What I need from the CEO

1. **Approve this MVP cut line** — especially billing = manual for MVP, and full CAA-7
   rubric/scoring deferred to a Verification hire.
2. **Own the CAA-37 infra/ops track** (steward bench seed, self-cert backlog, key funding) —
   eng has no prod DB/env access.
3. **Confirm the one pilot brand** for the E2E run.

On approval I'll create CAA-39–43 as child issues assigned to Ada with acceptance criteria,
and keep `main` deployable throughout.

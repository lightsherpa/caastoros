# Phase-3 adversarial verification — GATE · ISOLATION · AUTHORIZATION

Date: 2026-08-15 · Scope: certification gate (M0–M2), RLS write-lockdown (M1), tenant isolation (M3), reviewer authz / SoD (M2).
Method: read-only source + migration audit against the threat model; runnable probe at `scripts/probe-gate-isolation.mjs`.

**Headline:** the M1 REST write-lockdown is real and correctly closes the client-facing forge surface (bios cert flags, ledger, qa_results, steward_jobs, outputs). The residual risk has moved from *"any client forges via REST"* (closed) to **separation-of-duties inside the reviewer/steward layer** (the SoD control the spec promises is only partially implemented) plus **two controls that were written but are never actually enforced** (cert TTL staleness; storage-URL TTL). Nothing here is a remote any-client compromise; the top items are insider / policy-integrity gaps.

Severity legend: CRITICAL = remote unauthenticated / any-client compromise · HIGH = privileged-role or SoD circumvention with real blast radius · MED = a documented control that silently does not work · LOW = defense-in-depth.

---

## HIGH

### H1 — Steward SoD is advisory only: a user can self-certify AND human-certify the same brand
**What.** The rev-2 §5.1 rule ("a Steward never certifies a brand they craft on") is the moat's separation-of-duties control. It is enforced in exactly one place — `assignSteward()` — and only as an *assignment hint*, not a hard gate at the decision point. Three holes compound:

1. **Ownership/self-cert authorship is never checked.** `assign-steward.js:43-55` excludes only stewards who appear as `outputs.body.deliverables[].craft.delivered_by` (crafters). It never excludes the steward who *owns the brand's workspace* or who *authored the stage-1 self-cert*. A person holding both a client `users` row (owns brand → self-certifies via `bios.js:291` / `discovery-session.js:106`) and a `team_members` row with `steward`/`lead_steward` can human-certify their own brand.
2. **Rotation is bypassable by self-claim.** The rotation runs only at enqueue time. The steward decision endpoint lets any steward *self-assign an unassigned job* with no crafter/owner re-check: `steward.js:187-192` (`if (!job.assigned_to) { update assigned_to = steward.id }`). If rotation left a job unassigned (small team / only-steward-excluded → no lead → `no_eligible_steward_or_lead`, `assign-steward.js:124-128`), the excluded steward simply claims it.
3. **Reviewer can author-then-certify in one call.** `steward.js:201-221` lets the reviewer inject an arbitrary `bioPatch` (new BIO version) and then certify that same version they just wrote (`steward.js:238-245`).

**Evidence.** `server/src/lib/assign-steward.js:39-55` (crafter-only exclusion), `server/src/routes/steward.js:186-192` (self-claim, no SoD re-check), `steward.js:201-245` (author-then-certify).
**Attacker goal → attack.** A Caastor steward who also runs a client account grants their own brand production access without independent review: self-certify (stage 1) → ensure the drift/onboarding job is unassigned or claim it → submit `approve` scores → `bios.certified=true`. The SoD control that is supposed to make this impossible never fires.
**Fix (integrator).** Enforce SoD as a hard gate *at the decision point*, not just at assignment: in the `steward.js` PATCH submission path, reject when `steward.user_id` is (a) the brand's workspace owner, (b) the `bio_attestations.attested_by` for the version under review, or (c) a crafter on the brand. Re-run the rotation exclusion at claim time, not only at enqueue. Consider forbidding certify-in-same-call after `bioPatch` (require a second reviewer once the reviewer edited the payload).

### H2 — A lone Lead Steward certifies with zero four-eyes, across any tenant
**What.** Calibration/second-review is gated by `needsLeadApproval = calibration && !isLead && approves` (`steward.js:234`). Because it requires `!isLead`, **a Lead Steward's own approval is finalized immediately** (`finalCertified = approves && !needsLeadApproval`, `steward.js:235`) with no second reviewer. Four-eyes is only ever applied to a *non-lead's* submission on the calibration path (`steward.js:143`). Steward authority is global (no workspace scope in `requireSteward`, `steward.js:48-54`), so one Lead account can unilaterally certify any brand in any workspace.
**Evidence.** `server/src/routes/steward.js:234-245`; four-eyes present only at `steward.js:143`.
**Attacker goal → attack.** A single compromised/rogue Lead Steward credential certifies (or, with `bioPatch`, rewrites-then-certifies) arbitrary brands system-wide with no peer check.
**Fix.** Decide the policy explicitly. If leads must also be peer-reviewed, drop the `!isLead` short-circuit and require a *different* lead/super_admin to finalize every approval (extend the existing `assigned_to !== steward.id` four-eyes check to the direct-approve path). At minimum, require two distinct approvers for `onboarding` certs regardless of role.

---

## MED

### M1 — Certification TTL (`cert_valid_until`) is written but never enforced at the gate
**What.** M2 added `bios.cert_valid_until` and the steward routes set a 180-day TTL on every approval (`steward.js:165,243`), the whole point being that a stale certification must be re-reviewed. But the production gate only filters on the boolean: `loadBrandBio` does `bioQuery.eq("certified", true)` and never compares `cert_valid_until` to `now()` (`load-brand-bio.js:64-75`). An expired certification keeps passing the gate forever.
**Evidence.** written: `server/src/routes/steward.js:165,243`; never read: `grep cert_valid_until server/src` returns only the writes + decert clear; gate at `server/src/lib/load-brand-bio.js:64-75` ignores it.
**Attacker goal → attack.** No active attack needed — a brand whose BIO drifted past its review window keeps producing "certified" work indefinitely; the staleness control is inert.
**Fix.** In `loadBrandBio` (requireCertified branch) add `.or('cert_valid_until.is.null,cert_valid_until.gt.<nowIso>')` (or filter in JS) and throw a distinct `CERT_EXPIRED` (409) so the SPA can prompt re-certification.

### M2 — 1-year signed evidence URLs; the promised storage-TTL hardening never landed
**What.** M1's migration explicitly *defers* storage hardening ("replacing the 1-year signed URL in the bios.js upload route with short-lived per-request URLs … deferred to M3", `20260815000000_m1_gate_and_hardening.sql:59-63`). M3 (`20260815020000_m3_discovery.sql`) and M5 shipped no storage change, and both upload paths still mint 365-day signed URLs: `bios.js:96` and `runs.js:256` (`createSignedUrl(objectPath, 60*60*24*365)`). A signed URL is a bearer capability that ignores RLS; the 1-year lifetime means any leak (logs, referrer header, a shared link, the persisted `uploads.url` / `bio_sources.raw_ref` columns) grants a year of unauthenticated read to private brand evidence — including cross-tenant, since the URL carries its own authority.
**Evidence.** `server/src/routes/bios.js:92-96`, `server/src/routes/runs.js:255-257`; deferral note `supabase/migrations/20260815000000_m1_gate_and_hardening.sql:59-63`; no storage migration in M3/M5.
**Attacker goal → attack.** Obtain any persisted evidence/output URL (DB row, log line, forwarded link) → read the private object for up to a year with no auth.
**Fix.** Land the deferred change: store the object *path*, and sign short-lived (minutes) URLs per request in the GET handler that serves evidence, gated by the workspace check. Do not persist long-lived signed URLs in `uploads.url` / `bio_sources.raw_ref`.

### M3 — Discovery delegation magic-links never expire
**What.** `discovery_delegations` supports a `status='expired'` value (`m3 migration:45`) but nothing ever sets it and there is no `expires_at` column or TTL. The two open (unauthenticated) endpoints only reject non-`pending` tokens (`discovery-delegation.js:143,188`). A delegation that is opened (GET) but never submitted (PATCH) stays `pending` forever, so the tokened link is a **permanent** read credential for that draft chapter, and the invitee email is never verified against the caller. Token entropy is fine (`crypto.randomUUID()`), and scope is correctly limited to one chapter of one brand (see CLOSED), so the exposure is bounded — but unbounded in time.
**Evidence.** `server/src/routes/discovery-delegation.js:89` (token), `:133-164` (GET, pending-only), `:171-216` (PATCH, pending-only, sets `returned`); schema `supabase/migrations/20260815020000_m3_discovery.sql:38-52` (no `expires_at`; `expired` status unused).
**Attacker goal → attack.** A leaked/forwarded handoff link reads (and, if still pending, overwrites) the delegated chapter's draft indefinitely.
**Fix.** Add `expires_at` (e.g. now()+72h) and reject expired tokens in both handlers; optionally make GET single-use or bind the token to the invitee email at open time. A periodic job (or lazy check) flips lapsed rows to `expired`.

---

## LOW / defense-in-depth

### L1 — `team_members`, `users`, `brand_signals` are server-authoritative but omitted from the M1 write-revoke
The M1 revoke enumerates 12 tables (`20260815000000…:47-50`) but not `team_members` (holds `roles[]` → steward/lead/craft authority), `users` (holds `role`), or `brand_signals`. They are currently safe only because RLS has no write policy (default-deny: `init.sql:414-415` team_members SELECT-only; `:382-383` users self-SELECT; `brandolph_memory:51` signals SELECT-only). This is one accidental `for all` / write policy away from privilege escalation (a client granting itself `lead_steward`). Add these to the revoke list so grant and RLS both have to fail before a write lands. Verified currently-blocked by the probe (Section 2).

### L2 — Decert vs in-flight run is TOCTOU by design
`loadBioForRun` is checked once at run start (`runs.js:73`); a stream that already passed keeps producing after a mid-run decertification (the run pinned `bio_version`). Acknowledged in `steward.js:333-337`. The client-side assembly loop re-checks per `/stream` call, so subsequent specialists in the same assembly *are* blocked — only the single in-flight call slips through. Acceptable; documented here for completeness. If tighter, re-check cert just before the ledger debit / output insert.

### L3 — `craft PATCH /deliver` does not re-check the production gate
`craft.js:162` (deliver) has no `loadBioForRun`, unlike `craft.js:72` (contract). It only finishes an already-gated, already-contracted job, so impact is minimal, but a brand decertified mid-craft can still have polish delivered. Low.

### L4 — Default-privilege walk-back assumes migrations run as role `postgres`
`ALTER DEFAULT PRIVILEGES FOR ROLE postgres … REVOKE …` (`20260815000000…:56-57`) only governs objects created by `postgres`. If migrations ever run under a different owner, neither the walk-back nor the original grant apply. In practice Supabase CLI migrations run as `postgres`, and a wrong owner would also drop SELECT (breaking the SPA visibly), so this is self-announcing — noted as an environment assumption.

---

## CLOSED / verified safe

- **REST forge surface (the M1 core fix) — CLOSED.** `INSERT/UPDATE/DELETE` revoked from `anon, authenticated` on all 12 server-authoritative tables (`20260815000000…:47-50`). Probe Section 1 confirms a client cannot forge `bios.certified`, `bios.self_certified`, insert a certified `bios` row, insert a positive `ledger` row, complete a `steward_jobs`, flip `qa_results.passed`, or flip `outputs.status`. `SELECT` deliberately preserved (RLS governs reads).
- **New M2/M3 tables double-locked — CLOSED.** `cert_rubric_versions`, `cert_decisions`, `bio_attestations`, `discovery_sessions`, `discovery_delegations` all `enable row level security` with no client policy, and are created after M1's default-privilege I/U/D walk-back — so both the grant *and* RLS block client writes, and RLS-no-policy blocks client reads. Probe Section 3 confirms writes rejected and reads empty (no cross-tenant cert/attestation leak).
- **Tenant read-isolation — CLOSED.** `bios`/`briefs`/`outputs`/`qa_results` chain back to `brands` scoped by `workspace_id = (users.workspace_id)` (`init.sql:387-408`); every server route additionally re-checks `workspace_id` explicitly (`runs.js:531`, `bios.js:33/68/139/199`, `craft.js:61/170`, `outputs.js:28/77`, `brandolph.js:83`, `discovery.js:38`). Probe Section 4 confirms `brands` returns a single workspace and `steward_jobs` is invisible to a plain client.
- **`discovery_sessions` GET is workspace-scoped — CLOSED.** `ownedBrand(brandId, workspaceId)` guards GET/PATCH/attest (`discovery-session.js:28-32,43,73,109`).
- **Delegation token scope — CLOSED (except TTL, see M3).** Token is 122-bit `randomUUID`; GET/PATCH expose and merge *only* `SECTIONS`-validated `del.chapter` of the bound `session_id`, copying all other chapters through verbatim (`discovery-delegation.js:145-163,190-204`). No cross-chapter or cross-brand read/write from a single token.
- **Gate coverage on every production/briefing path — CLOSED.** Production: `runs.js:73` and `craft.js:72` → `loadBioForRun` (throws `BIO_NOT_CERTIFIED`). Briefing: `briefs.js:29` → `loadBioForBriefing` (throws `NOT_SELF_CERTIFIED`). Brandolph `/ask` is read-only Q&A with no output write, intentionally pre-cert (`brandolph.js:37-48`). The assembly loop is client-side and re-checks the gate on each `/stream` call. No server production path bypasses the loader.
- **Four-eyes on the calibration path — CLOSED.** A Lead cannot finalize their own submission: `if (job.assigned_to === steward.id) return 409` (`steward.js:143`). (The gap is that direct Lead approvals never reach this path — see H2.)
- **Vinilo seed cannot leak into production — CLOSED.** The fictional seed is returned only behind `ALLOW_SEED_BIO=1` and only on the no-gate read path; both gated loaders throw before reaching it (`load-brand-bio.js:78-96`).
- **SSRF guard on discovery start — CLOSED (adjacent).** `assertPublicUrl` blocks non-public scrape targets before the pipeline (`discovery.js:29`).

---

## Probe harness

`scripts/probe-gate-isolation.mjs` (`node --check` clean). Mirrors `scripts/test-gate.mjs`: `@supabase/supabase-js` + `SUPABASE_URL` / `SUPABASE_ANON_KEY` / optional `TEST_JWT`; optional `API_BASE` (+ `TEST_UNCERTIFIED_BRAND_ID`) enables the HTTP gate + delegation-token probes. Every attack asserts *blocked*; anything it lacks credentials for SKIPs with a note; any row a vuln lets it create is reverted/deleted in cleanup. It exercises the CLOSED items above (forge lockdown, role-escalation, new-table read+write lockdown, read-isolation) and the gate at the HTTP edge; it cannot exercise H1/H2 (needs seeded steward + lead JWTs and team wiring) — those are source-confirmed and flagged for the integrator to cover with a steward-role integration test.

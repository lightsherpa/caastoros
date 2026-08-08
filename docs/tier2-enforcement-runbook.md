# Tier-2 (human) BIO certification — enforcement runbook

**Decision (CAA-25, Brandolph):** production **enforces** tier-2. Every specialist run
must read a BIO a senior human signed. The gate is `REQUIRE_HUMAN_CERT`. The guarantee
is precise: **the BIO is human-certified**; outputs are grounded in that certified BIO
and can be **optionally** human-finished on the client's request — *not* every output is
individually certified.

## What is already in code (shipped, reversible)

- `loadBioForRun()` (`server/src/lib/load-brand-bio.js`) reads `REQUIRE_HUMAN_CERT`. When
  `=1` it additionally requires `certified_by` to be non-null (a real Steward signed it).
- All three run entrypoints — `briefs.js`, `runs.js`, `brandolph.js` — turn a missing
  human cert into a friendly **409 "awaiting Brand Steward certification"**.
- Default is env-driven and fail-safe: unset ⇒ off, so *deploying this branch does not
  enforce anything until the env var is set in prod*. The flip is a deliberate ops action.

## Why you cannot just flip the switch

`assign-steward.js` needs at least one **active `steward`/`lead_steward` `team_member`
linked to a login**. With none seeded, cert jobs are left unassigned, no BIO ever gets
`certified_by` set, and **every run 409s**. `supabase/seed.sql` seeds no Stewards (a
Steward is a real person, not fixture data). So enforcement is only safe once a real
Steward exists in prod and the current backlog of self-certified BIOs is cleared.

## Sequenced go-live (do in order)

1. **Seed a real Steward bench in prod.** Insert `team_members` rows with real
   `users.id`, `roles = '{steward}'` (and at least one `'{steward,lead_steward}'` so
   calibration can finalize). Template in `supabase/seed.sql`.
2. **Set `STEWARD_CALIBRATION_REQUIRED` for the bench size.** Default `true` means a lone
   non-Lead Steward can never finalize; with a single Steward who is also `lead_steward`,
   true is fine.
3. **Clear the legacy backlog.** Existing prod BIOs are self-certified (`certified_by =
   NULL`); the instant enforcement turns on they 409 until signed. Either (a) have the
   seeded Steward work the cert queue, or (b) run a controlled admin re-cert. **Do not**
   use `scripts/backfill-self-cert.mjs` for this — it sets `certified_by = NULL` (the
   opposite of a human signature) and now refuses to run without `CONFIRM=1`.
4. **Fund the keys** enforcement depends on end-to-end: `FIRECRAWL_API_KEY`,
   `OPENROUTER_API_KEY` (Discovery must be able to compile BIOs for new brands).
5. **Flip it.** Set `REQUIRE_HUMAN_CERT=1` in the prod environment. Verify one brand: an
   unsigned BIO 409s; a signed BIO runs and its outputs read `certified by {name}`.

## Rollback

Set `REQUIRE_HUMAN_CERT=0` (or unset). Self-certified BIOs run again immediately; no data
migration needed.

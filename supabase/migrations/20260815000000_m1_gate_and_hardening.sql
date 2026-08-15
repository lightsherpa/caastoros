-- ─────────────────────────────────────────────────────────────────────
-- M1 · Certification gate + security hardening
-- (spec: docs/2026-08-14-canonical-spec-bio-v1.md §7 threat model)
--
-- Three things:
--   1. super_admin role (review-hierarchy authority; powers wired in M2).
--   2. Self-certification (stage 1) columns on bios + a cutover backfill so
--      brands running today keep their briefing access.
--   3. RLS WRITE-LOCKDOWN — the core fix.
--
-- Why the lockdown: 20260524185323 did `grant all on all tables to anon,
-- authenticated` and every tenant policy is `for all USING(<tenancy>)` with
-- no WITH CHECK. Postgres then reuses the tenancy predicate as the write
-- check, so an authenticated browser (anon key + its own JWT) could
-- `PATCH /rest/v1/bios {certified:true}` or insert positive `ledger` rows
-- directly through PostgREST — the row passes the tenancy check because
-- `certified`/`credits` are not in the predicate. Adding WITH CHECK does
-- NOT help (it would reuse the same tenancy predicate). The fix is to
-- REVOKE write privileges from the client roles; all writes go through the
-- service-role server. SELECT stays — RLS tenancy governs reads, and the
-- SPA reads these tables directly via the anon key. Mirrors the pattern
-- already applied to `notifications` (20260708120000).
-- ─────────────────────────────────────────────────────────────────────

-- 1 ── super_admin role ────────────────────────────────────────────────
alter table users drop constraint if exists users_role_check;
alter table users add constraint users_role_check
  check (role in ('client', 'team', 'admin', 'super_admin'));

-- 2 ── self-certification (stage 1) ────────────────────────────────────
alter table bios add column if not exists self_certified    boolean not null default false;
alter table bios add column if not exists self_certified_at  timestamptz;

-- Cutover: grant self-cert to every existing brand's LATEST BIO so briefing
-- keeps working for brands running today (per the M1 cutover decision).
-- Production (stage 2, human cert) is deliberately NOT grandfathered — it
-- hard-blocks until a Steward certifies in M2.
update bios b
   set self_certified = true,
       self_certified_at = now()
 where b.version = (select max(b2.version) from bios b2 where b2.brand_id = b.brand_id)
   and b.self_certified = false;

-- 3 ── RLS write-lockdown ──────────────────────────────────────────────
-- Revoke client-role writes on every server-authoritative table. Reads
-- (SELECT) remain, governed by the existing tenancy RLS policies.
revoke insert, update, delete on
  brands, briefs, bios, bio_sources, clarifications,
  runs, outputs, qa_results, ledger, uploads, workspaces, steward_jobs
from anon, authenticated;

-- Future tables must not silently re-grant client writes (20260524185323
-- set `alter default privileges ... grant all`). Keep SELECT default; RLS
-- governs reads, and the CI invariant (no public table without RLS + a
-- policy) covers the read side.
alter default privileges for role postgres in schema public
  revoke insert, update, delete on tables from anon, authenticated;

-- NOTE: Storage hardening (replacing the 1-year signed URL in the bios.js
-- upload route with short-lived per-request URLs) is deferred to M3, where
-- the evidence pipeline is reworked. storage.objects is service-role-only by
-- Supabase default, so direct client object access is not currently open;
-- the residual risk is a leaked long-lived URL, which the M3 TTL change closes.

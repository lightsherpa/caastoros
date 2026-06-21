-- ─────────────────────────────────────────────────────────────────────
-- P0-003 follow-up · Standard Supabase grants + admin-table RLS
--
-- The dashboard SQL editor auto-grants on table creation, but CLI
-- migrations don't. Without explicit GRANTs, PostgREST sees zero
-- tables for anon/authenticated/service_role and every REST call
-- returns 403 "permission denied". This migration:
--
-- 1. Grants USAGE on schema public + ALL on tables/sequences/routines
--    to the three Supabase API roles (anon, authenticated, service_role).
-- 2. Sets default privileges so future tables created in this schema
--    inherit the same grants.
-- 3. Enables RLS on the admin-curated tables (industries, specs,
--    templates, template_versions) with read-all policies for
--    authenticated. Writes remain service-role-only (bypasses RLS).
--
-- The init migration deliberately deferred grants to P0-006; we're
-- promoting that to right-now because nothing works without them.
-- ─────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────
-- Schema + table grants (standard Supabase pattern)
-- ─────────────────────────────────────────────────────────────
grant usage on schema public to anon, authenticated, service_role;

grant all on all tables    in schema public to anon, authenticated, service_role;
grant all on all routines  in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;

-- Future tables/sequences/functions in public inherit the same grants
alter default privileges for role postgres in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on routines  to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────
-- Admin-curated tables — enable RLS with read-all policies for
-- authenticated; writes are service-role only (bypasses RLS).
-- This protects against anon/authenticated mutating these rows
-- even though grants permit it.
-- ─────────────────────────────────────────────────────────────
alter table industries        enable row level security;
alter table specs             enable row level security;
alter table templates         enable row level security;
alter table template_versions enable row level security;

create policy industries_read        on industries        for select to anon, authenticated using (active = true);
create policy specs_read             on specs             for select to anon, authenticated using (active = true);
create policy templates_read         on templates         for select to anon, authenticated using (archived_at is null);
create policy template_versions_read on template_versions for select to anon, authenticated using (status = 'live' and active = true);

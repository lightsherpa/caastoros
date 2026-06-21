-- ─────────────────────────────────────────────────────────────────────
-- P0-003 · Schema bootstrap
--
-- Bundles the kernel schema from `docs/apis-and-agents-plan.md §5`
-- AND the rev-2 additions from `docs/2026-05-24-modes-templates-steward-plan.md §10`
-- in a single initial migration. Splitting them risks shipping an
-- early system without the moat-defining fields (bios.certified_by, etc.).
--
-- Reading map:
--   §5  kernel    — workspaces, users, brands, bios, bio_sources, briefs,
--                   clarifications, specs, runs, outputs, qa_results,
--                   ledger, uploads
--   §10 rev-2     — team_members, industries, templates, template_versions,
--                   steward_jobs; + new columns on brands, bios, briefs,
--                   bio_sources, uploads
--   §8.5 rev-2    — public_* views for the `?ask=` allowlist (created here;
--                   GRANTs to docs service role land in P8)
--
-- RLS pattern: every workspace-scoped table denies by default and admits
-- only rows where the workspace_id matches the caller's session user.
-- See §7.2 cross-cutting concerns in the engineering refinement.
-- ─────────────────────────────────────────────────────────────────────

-- Extensions (Supabase enables pgcrypto by default; declare explicitly
-- so a fresh self-hosted project also gets it).
create extension if not exists "pgcrypto";

-- ─────────────────────────────────────────────────────────────
-- §5 Tenancy
-- ─────────────────────────────────────────────────────────────
create table workspaces (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null,
  tier                 text not null default '00' check (tier in ('00','01','02','03')),
  stripe_customer_id   text,
  created_at           timestamptz not null default now()
);

create table users (
  id                   uuid primary key references auth.users(id) on delete cascade,
  workspace_id         uuid not null references workspaces(id) on delete cascade,
  email                text not null,
  role                 text not null default 'client' check (role in ('client','team','admin')),
  created_at           timestamptz not null default now()
);
create index users_workspace_idx on users (workspace_id);

-- ─────────────────────────────────────────────────────────────
-- §10 Team — a team_member can hold MULTIPLE roles simultaneously
-- (e.g. 'craft' + 'steward'). The rotation rule in §5.1 reads
-- `runs.assigned_to` to exclude crafters from certifying their own brands.
-- ─────────────────────────────────────────────────────────────
create table team_members (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid references users(id),
  name                 text not null,
  first_name           text not null,
  avatar_url           text,
  roles                text[] not null default '{}',
  hourly_rate_cents    int,
  active               boolean not null default true,
  created_at           timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- §4.4 Industries — CMS-style, NOT enum. Multilingual labels.
-- Soft-deleted via active=false; brands tagged to archived industries
-- fall back to "broad" template surfacing (§4.1).
-- ─────────────────────────────────────────────────────────────
create table industries (
  id                   uuid primary key default gen_random_uuid(),
  slug                 text unique not null,
  label_en             text not null,
  label_es             text,
  label_it             text,
  display_order        int not null default 0,
  active               boolean not null default true,
  archived_at          timestamptz,
  created_at           timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- §5 + §4.5 Brands — with rev-2 industry attribution (inferred by
-- a30 BIO Compiler in P1.6, confirmed by user at end of Discovery).
-- ─────────────────────────────────────────────────────────────
create table brands (
  id                   uuid primary key default gen_random_uuid(),
  workspace_id         uuid not null references workspaces(id) on delete cascade,
  name                 text not null,
  url                  text,
  industry             text references industries(slug),
  industry_confidence  float check (industry_confidence between 0 and 1),
  industry_source      text check (industry_source in ('inferred','user_confirmed','user_set')),
  refusals             text[] not null default '{}',
  created_at           timestamptz not null default now()
);
create index brands_workspace_idx on brands (workspace_id);

-- ─────────────────────────────────────────────────────────────
-- §5 BIO — append-only versioned + §10 rev-2 certification fields.
-- `loadBioForRun()` in P1.5-003 selects the highest-version row where
-- certified = true. Uncertified candidates exist alongside the
-- currently-certified version until the Steward re-certifies (§5.5).
-- ─────────────────────────────────────────────────────────────
create table bios (
  id                   uuid primary key default gen_random_uuid(),
  brand_id             uuid not null references brands(id) on delete cascade,
  version              int not null,
  payload              jsonb not null,
  score                int,
  certified            boolean not null default false,
  certified_by         uuid references team_members(id),
  certified_at         timestamptz,
  steward_notes        text,
  cert_kind            text check (cert_kind in ('onboarding','drift_check','re_extract')),
  created_by           uuid references users(id),
  created_at           timestamptz not null default now(),
  unique (brand_id, version)
);
create index bios_brand_certified_idx on bios (brand_id, certified, version desc);

-- §5.3 Three-bucket source intake. `bucket` populated by QW-003 / P1-003;
-- URL-derived sources (scraped sites) leave bucket null.
create table bio_sources (
  id                   uuid primary key default gen_random_uuid(),
  brand_id             uuid not null references brands(id) on delete cascade,
  kind                 text not null,
  bucket               text check (bucket in ('foundations','visual','voice')),
  src                  text not null,
  signals              jsonb,
  raw_ref              text,
  created_at           timestamptz not null default now()
);
create index bio_sources_brand_idx on bio_sources (brand_id);

-- ─────────────────────────────────────────────────────────────
-- §5 Briefs + §3 rev-2 mode + template pin
-- ─────────────────────────────────────────────────────────────
create table briefs (
  id                   uuid primary key default gen_random_uuid(),
  brand_id             uuid not null references brands(id) on delete cascade,
  title                text,
  type                 text,
  payload              jsonb,
  sharpened_payload    jsonb,
  mode                 text not null default 'auto' check (mode in ('auto','manual','template')),
  template_version_id  uuid,                     -- FK added after template_versions exists
  assembly_override    jsonb,
  status               text not null default 'draft',
  created_at           timestamptz not null default now()
);
create index briefs_brand_idx on briefs (brand_id);

create table clarifications (
  id                   uuid primary key default gen_random_uuid(),
  brief_id             uuid not null references briefs(id) on delete cascade,
  q                    text,
  a                    text,
  why                  text,
  created_at           timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- §5 Specs — one row per (specialist_id, version); exactly one active.
-- Runs pin to the spec version they ran → reproducibility forever.
-- ─────────────────────────────────────────────────────────────
create table specs (
  id                   uuid primary key default gen_random_uuid(),
  specialist_id        text not null,            -- 'a01'..'a33', 'brandolph_l1'
  version              int not null,
  payload              jsonb not null,           -- role, objective, method, outputContract, refusals, voice, tools, modelRouting, bioSlices
  active               boolean not null default false,
  created_at           timestamptz not null default now(),
  unique (specialist_id, version)
);
create unique index one_active_spec_per_specialist
  on specs (specialist_id) where active = true;

-- ─────────────────────────────────────────────────────────────
-- §4 Templates — stable + versioned. Briefs created from template
-- pin `template_version_id` at creation → reproducibility across edits.
-- ─────────────────────────────────────────────────────────────
create table templates (
  id                   uuid primary key default gen_random_uuid(),
  slug                 text unique not null,
  name                 text not null,
  tagline              text,
  archived_at          timestamptz,
  created_at           timestamptz not null default now()
);

create table template_versions (
  id                   uuid primary key default gen_random_uuid(),
  template_id          uuid not null references templates(id) on delete cascade,
  version              int not null,
  outcome              text,
  brief_skeleton       jsonb,
  assembly             jsonb,                    -- ordered ['a02','a03','a20',...]
  expected_output_kinds text[],
  qa_gates             jsonb not null default '{"voice": true, "brand": true}'::jsonb,
  estimate_credits     int,
  industries           text[],                    -- ['hospitality_fnb', ...] — slugs, FK by convention
  objectives           text[],
  featured             boolean not null default false,
  featured_priority    int,
  tier_from            text not null check (tier_from in ('00','01','02','03')),
  status               text not null default 'draft' check (status in ('draft','live','archived')),
  active               boolean not null default false,
  last_used_at         timestamptz,
  created_by           uuid references team_members(id),
  created_at           timestamptz not null default now(),
  unique (template_id, version)
);
create unique index one_active_version_per_template
  on template_versions (template_id) where active = true;

-- Now safe to add the briefs → template_versions FK
alter table briefs add constraint briefs_template_version_fk
  foreign key (template_version_id) references template_versions(id);

-- ─────────────────────────────────────────────────────────────
-- §5 Runs — the kernel. One row per specialist invocation, ever.
-- Pins spec_version + bio_version for forever-reproducibility.
-- ─────────────────────────────────────────────────────────────
create table runs (
  id                   uuid primary key default gen_random_uuid(),
  brief_id             uuid not null references briefs(id) on delete cascade,
  specialist_id        text not null,
  spec_version         int not null,
  bio_version          int not null,
  model_used           text,
  status               text not null default 'queued' check (status in ('queued','running','completed','failed')),
  prompt_tokens        int,
  completion_tokens    int,
  cached_tokens        int,
  cost_usd             numeric(10,4),
  latency_ms           int,
  started_at           timestamptz,
  ended_at             timestamptz,
  created_at           timestamptz not null default now()
);
create index runs_brief_idx on runs (brief_id);
create index runs_specialist_idx on runs (specialist_id);

create table outputs (
  id                   uuid primary key default gen_random_uuid(),
  run_id               uuid not null references runs(id) on delete cascade,
  brief_id             uuid not null references briefs(id) on delete cascade,
  kind                 text not null,
  body                 jsonb,
  asset_url            text,
  status               text not null default 'pending' check (status in ('pending','approved','flagged','rejected')),
  rationale            text,
  created_at           timestamptz not null default now()
);
create index outputs_brief_idx on outputs (brief_id);

create table qa_results (
  id                   uuid primary key default gen_random_uuid(),
  output_id            uuid not null references outputs(id) on delete cascade,
  refusal_id           text,
  passed               boolean,
  evidence             text,
  created_at           timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- §5 Ledger — event-sourced credit history. Balance is derived.
-- kind covers all rev-2 charge sources, including absorbed-cost
-- 'steward_cert' rows (used for §5.2 tripwire monitoring).
-- ─────────────────────────────────────────────────────────────
create table ledger (
  id                   uuid primary key default gen_random_uuid(),
  workspace_id         uuid not null references workspaces(id) on delete cascade,
  run_id               uuid references runs(id),
  credits              int not null,             -- positive = debit; negative = credit
  kind                 text not null,            -- 'run','steward_cert','steward_drift','re_extract','topup','monthly_pool'
  balance_after        int,
  created_at           timestamptz not null default now()
);
create index ledger_workspace_idx on ledger (workspace_id, created_at desc);

-- ─────────────────────────────────────────────────────────────
-- §10 rev-2 Steward jobs (P1.5)
-- Includes §5.4 outputs_reviewed_count (drives drift pricing tier),
-- §5.1 lead_reviewed_* (calibration second-review), and
-- §5.1 override_reason (capacity fallback log).
-- ─────────────────────────────────────────────────────────────
create table steward_jobs (
  id                       uuid primary key default gen_random_uuid(),
  bio_id                   uuid not null references bios(id),
  brand_id                 uuid not null references brands(id),
  kind                     text not null check (kind in ('onboarding','drift_check','re_extract')),
  status                   text not null default 'queued' check (status in ('queued','in_review','pending_lead_review','completed','cancelled')),
  assigned_to              uuid references team_members(id),
  outputs_reviewed_count   int,
  lead_reviewed_by         uuid references team_members(id),
  lead_reviewed_at         timestamptz,
  override_reason          text,
  credits_charged          int not null default 0,
  queued_at                timestamptz not null default now(),
  completed_at             timestamptz
);
create index steward_jobs_status_idx on steward_jobs (status, queued_at);
create index steward_jobs_brand_idx on steward_jobs (brand_id);

-- ─────────────────────────────────────────────────────────────
-- §5 Uploads — with rev-2 bucket_hint carrying the QW-003 bucket
-- selection through from the upload UI into bio_sources.
-- ─────────────────────────────────────────────────────────────
create table uploads (
  id                   uuid primary key default gen_random_uuid(),
  workspace_id         uuid not null references workspaces(id) on delete cascade,
  user_id              uuid not null references users(id),
  brand_id             uuid references brands(id),
  url                  text not null,
  mime                 text,
  bucket_hint          text check (bucket_hint in ('foundations','visual','voice')),
  created_at           timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- §8.5 Public views for the `?ask=` docs allowlist
-- Created here as placeholders; SELECT grants to the docs service
-- role land in P8 when the Nextra site ships. Critical: views
-- expose ONLY metadata — never prompt_template, never any brand data.
-- ─────────────────────────────────────────────────────────────
create view public_specs as
  select specialist_id,
         payload->>'name'               as name,
         payload->>'role_label'         as role_label,
         payload->>'department'         as department,
         payload->>'public_description' as public_description,
         version
  from specs
  where active = true;

create view public_template_versions as
  select tv.id,
         t.slug,
         t.name,
         tv.outcome,
         tv.assembly,
         tv.expected_output_kinds,
         tv.estimate_credits,
         tv.tier_from,
         tv.industries
  from template_versions tv
  join templates t on t.id = tv.template_id
  where tv.active = true and tv.status = 'live';

create view public_industries as
  select slug, label_en, label_es, label_it, display_order
  from industries
  where active = true;

-- ─────────────────────────────────────────────────────────────
-- RLS — workspace isolation
-- Default-deny on every workspace-scoped table; admit only rows
-- where workspace_id matches the caller's session user.
-- Steward jobs gated by the 'steward' or 'lead_steward' role on
-- team_members.roles for the calling user.
-- ─────────────────────────────────────────────────────────────
alter table workspaces      enable row level security;
alter table users           enable row level security;
alter table team_members    enable row level security;
alter table brands          enable row level security;
alter table bios            enable row level security;
alter table bio_sources     enable row level security;
alter table briefs          enable row level security;
alter table clarifications  enable row level security;
alter table runs            enable row level security;
alter table outputs         enable row level security;
alter table qa_results      enable row level security;
alter table ledger          enable row level security;
alter table uploads         enable row level security;
alter table steward_jobs    enable row level security;
-- specs, templates, template_versions, industries are admin-curated;
-- public reads via the public_* views above + explicit GRANTs in P0-006.

-- A user can read their own row (so the SPA can resolve workspace_id)
create policy users_self_read on users for select to authenticated
  using (id = auth.uid());

-- Generic workspace isolation: a row is readable iff the caller's
-- users.workspace_id matches the row's workspace_id.
create policy ws_brands         on brands         for all to authenticated
  using (workspace_id = (select workspace_id from users where id = auth.uid()));
create policy ws_briefs         on briefs         for all to authenticated
  using (brand_id in (select id from brands));
create policy ws_bios           on bios           for all to authenticated
  using (brand_id in (select id from brands));
create policy ws_bio_sources    on bio_sources    for all to authenticated
  using (brand_id in (select id from brands));
create policy ws_clarifications on clarifications for all to authenticated
  using (brief_id in (select id from briefs));
create policy ws_runs           on runs           for all to authenticated
  using (brief_id in (select id from briefs));
create policy ws_outputs        on outputs        for all to authenticated
  using (brief_id in (select id from briefs));
create policy ws_qa_results     on qa_results     for all to authenticated
  using (output_id in (select id from outputs));
create policy ws_ledger         on ledger         for all to authenticated
  using (workspace_id = (select workspace_id from users where id = auth.uid()));
create policy ws_uploads        on uploads        for all to authenticated
  using (workspace_id = (select workspace_id from users where id = auth.uid()));
create policy ws_workspaces     on workspaces     for all to authenticated
  using (id = (select workspace_id from users where id = auth.uid()));

-- Team_members: visible to all authenticated users (team directory is
-- not workspace-private); writes are admin-only (no policy → service
-- role only). The `craft → humans` directory in the client portal
-- reads via the SDK's anon key + this read policy.
create policy team_members_read on team_members for select to authenticated
  using (active = true);

-- Steward jobs: only team members with 'steward' or 'lead_steward'
-- can see or mutate the queue.
create policy steward_role on steward_jobs for all to authenticated
  using (
    exists (
      select 1 from team_members tm
      where tm.user_id = auth.uid()
        and (tm.roles @> array['steward']::text[] or tm.roles @> array['lead_steward']::text[])
    )
  );

-- ─────────────────────────────────────────────────────────────
-- Auth trigger: when a new auth.users row is inserted, create a
-- matching users row + a default workspace + a default brand so
-- the first sign-in lands a usable workspace state without UI ceremony.
-- Tier defaults to '00' (Free); user can upgrade via Stripe at P7.
-- ─────────────────────────────────────────────────────────────
create or replace function handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_workspace_id uuid;
  new_brand_id uuid;
begin
  -- Create a default workspace named from the email's local part
  insert into workspaces (name, tier)
    values (split_part(new.email, '@', 1) || '''s workspace', '00')
    returning id into new_workspace_id;

  -- Create the users row linking auth.users → workspace
  insert into users (id, workspace_id, email, role)
    values (new.id, new_workspace_id, new.email, 'client');

  -- Seed a default brand so first /home and /bio render against real rows
  insert into brands (workspace_id, name)
    values (new_workspace_id, 'My brand')
    returning id into new_brand_id;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_auth_user();

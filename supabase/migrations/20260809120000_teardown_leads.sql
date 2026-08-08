-- ─────────────────────────────────────────────────────────────
-- CAA-33 · BIO Teardown v0 (Phase 0a, self-serve lead magnet)
--
-- Additive only. The teardown reuses the existing brands/bios/bio_sources
-- engine verbatim (compile-bio runs with mode:"teardown"). This migration
-- adds:
--   1. brands.source        — provenance of a brand row (discovery|teardown)
--   2. teardown_leads        — one row per URL submitted to the wedge, carries
--                              the email-gate capture + PQL score + claim state
--   3. teardown_events       — append-only funnel sink CAA-16 reads (§3.1 spec)
--
-- No schema change touches the BIO envelope: the 0–100 scorecard stays a pure
-- view over bios.payload (scoreBio) and its already-persisted bios.score.
-- ─────────────────────────────────────────────────────────────

-- 1 · Brand provenance. Existing rows default to 'discovery' (unchanged
--     behaviour); teardown leads insert with 'teardown'.
alter table brands
  add column if not exists source text not null default 'discovery'
  check (source in ('discovery', 'teardown'));

-- 2 · Leads. A lead owns exactly one brand (created in a throwaway tier-00
--     workspace). `claimed_by_user_id` stays null until the visitor signs up —
--     "claim" then attaches the workspace/brand to that user and the SAME
--     brand's bios version history continues (v2, v3 … on real briefs).
create table if not exists teardown_leads (
  id                 uuid primary key default gen_random_uuid(),
  brand_id           uuid not null references brands(id) on delete cascade,
  workspace_id       uuid not null references workspaces(id) on delete cascade,
  bio_id             uuid references bios(id) on delete set null,
  url                text not null,
  status             text not null default 'processing'
                       check (status in ('processing', 'ready', 'failed', 'claimed')),
  score              int,                       -- snapshot of bios.score at ready
  email              text,                      -- captured at the gate
  pql_score          int,                       -- 0-100, computed at email capture
  pql_band           text check (pql_band in ('cold', 'warm', 'hot')),
  offer_key          text,                      -- which pilot offer variant was shown
  claimed_by_user_id uuid references users(id) on delete set null,
  claimed_at         timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists teardown_leads_brand_idx  on teardown_leads (brand_id);
create index if not exists teardown_leads_status_idx on teardown_leads (status, created_at desc);
create index if not exists teardown_leads_email_idx  on teardown_leads (lower(email));

-- 3 · Funnel event sink (append-only). CAA-16 reads this table (pull) and/or
--     forwards to the @caastor/analytics taxonomy. `name` uses the taxonomy
--     names: teardown_started, teardown_bio_ready, teardown_report_viewed,
--     teardown_email_captured, teardown_pql_created, teardown_bio_downloaded,
--     teardown_pilot_cta_clicked.
create table if not exists teardown_events (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid references teardown_leads(id) on delete cascade,
  brand_id    uuid references brands(id) on delete set null,
  name        text not null,
  props       jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists teardown_events_lead_idx on teardown_events (lead_id, created_at);
create index if not exists teardown_events_name_idx on teardown_events (name, created_at desc);

-- RLS: both tables are service-role-only (the public /api/teardown route uses
-- the service-role client, which bypasses RLS). Enabling RLS with NO policies
-- denies all anon/authenticated access — leads + emails are never client-readable.
alter table teardown_leads  enable row level security;
alter table teardown_events enable row level security;

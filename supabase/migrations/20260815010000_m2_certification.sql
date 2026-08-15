-- ─────────────────────────────────────────────────────────────────────
-- M2 · Two-stage certification
-- (spec: docs/2026-08-14-canonical-spec-bio-v1.md §3)
--
--   • Stage 1 self-cert   → bio_attestations (append-only client attestation)
--   • Stage 2 human cert  → analytic rubric (cert_rubric_versions, config as
--                           data) + four decision states + cert_decisions
--                           (append-only, defensible audit trail)
--   • Decertification + TTL staleness
--
-- All new tables are server-authoritative: RLS enabled, no client policy
-- (service role bypasses; the SPA reads cert data via /api/steward/* and
-- /api/bios/*). M1's default-privilege walk-back already removed client
-- writes on future tables.
-- ─────────────────────────────────────────────────────────────────────

-- 1 ── steward_jobs: decision states + decision payload ────────────────
alter table steward_jobs drop constraint if exists steward_jobs_status_check;
alter table steward_jobs add constraint steward_jobs_status_check
  check (status in ('queued','in_review','pending_lead_review','completed','cancelled','changes_requested','rejected','decertified'));

alter table steward_jobs add column if not exists decision           text;
alter table steward_jobs add column if not exists conditions         jsonb;
alter table steward_jobs add column if not exists required_changes   jsonb;
alter table steward_jobs add column if not exists reject_reason_code text;
alter table steward_jobs add column if not exists rubric_version_id  uuid;
alter table steward_jobs add column if not exists composite_score    int;
alter table steward_jobs add constraint steward_jobs_decision_check
  check (decision is null or decision in ('approve','approve_with_conditions','return_changes','reject','decertify'));

-- 2 ── bios: certification TTL (staleness) ─────────────────────────────
alter table bios add column if not exists cert_valid_until timestamptz;

-- 3 ── cert_rubric_versions: the rubric config, versioned like specs ────
create table if not exists cert_rubric_versions (
  id         uuid primary key default gen_random_uuid(),
  version    int not null,
  config     jsonb not null,
  active     boolean not null default false,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);
-- At most one active rubric globally.
create unique index if not exists one_active_rubric on cert_rubric_versions (active) where active;
alter table cert_rubric_versions enable row level security;

-- Seed the default rubric (mirrors DEFAULT_RUBRIC in evaluate-certification.js).
insert into cert_rubric_versions (version, config, active)
select 1, '{
  "rubric_version": 1,
  "selfCertMinScore": 58,
  "criteria": [
    {"id":"C1","label":"Coverage completeness","weight":0.15,"source":"auto","signal":"coverage","gating":true,"floor":2},
    {"id":"C2","label":"Evidence grounding","weight":0.15,"source":"auto","signal":"grounding","gating":false,"floor":0},
    {"id":"C3","label":"High-importance field integrity","weight":0.25,"source":"human","gating":true,"floor":3},
    {"id":"C4","label":"Positioning distinctiveness","weight":0.15,"source":"human","gating":false,"floor":0},
    {"id":"C5","label":"Voice fidelity","weight":0.10,"source":"human","gating":false,"floor":0},
    {"id":"C6","label":"Internal consistency","weight":0.10,"source":"human","gating":true,"floor":2},
    {"id":"C7","label":"Strategic soundness","weight":0.10,"source":"human","gating":false,"floor":0}
  ],
  "bands": {"approve":80,"approve_with_conditions":68,"return_changes":50}
}'::jsonb, true
where not exists (select 1 from cert_rubric_versions);

-- 4 ── cert_decisions: append-only, defensible audit trail ──────────────
-- One row per decision EVENT (including each calibration re-review). A later
-- re-cert never overwrites a prior row — "why?" reconstructs from here.
create table if not exists cert_decisions (
  id                 uuid primary key default gen_random_uuid(),
  steward_job_id     uuid references steward_jobs(id) on delete set null,
  bio_id             uuid references bios(id) on delete cascade,
  brand_id           uuid references brands(id) on delete cascade,
  actor_id           uuid references team_members(id) on delete set null,
  actor_role         text,
  decision           text not null,
  rubric_version_id  uuid references cert_rubric_versions(id) on delete set null,
  composite_score    int,
  band               text,
  criterion_scores   jsonb,   -- the rubric breakdown at decision time
  gate_failures      jsonb,
  auto_signals       jsonb,   -- scoreBio subterms snapshot
  focus_addressed    jsonb,
  focus_unaddressed  jsonb,
  conditions         jsonb,
  required_changes   jsonb,
  reject_reason_code text,
  narrative          text,
  bio_payload_hash   text,    -- sha256 of the exact payload certified
  created_at         timestamptz not null default now()
);
create index if not exists cert_decisions_brand_idx on cert_decisions (brand_id, created_at desc);
create index if not exists cert_decisions_bio_idx   on cert_decisions (bio_id);
alter table cert_decisions enable row level security;

-- 5 ── bio_attestations: append-only client self-cert record ────────────
create table if not exists bio_attestations (
  id                uuid primary key default gen_random_uuid(),
  bio_id            uuid references bios(id) on delete cascade,
  brand_id          uuid references brands(id) on delete cascade,
  attested_by       uuid references users(id) on delete set null,
  payload_hash      text not null,       -- binds the attestation to an exact BIO version's bytes
  statement_version text not null,
  field_marks       jsonb,               -- { "audience.primary":"accurate", "goals.northStar":"aspirational", ... }
  self_score        int,                 -- scoreBio at attestation time (frozen)
  created_at        timestamptz not null default now()
);
create index if not exists bio_attestations_bio_idx on bio_attestations (bio_id);
alter table bio_attestations enable row level security;

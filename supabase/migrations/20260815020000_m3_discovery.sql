-- ─────────────────────────────────────────────────────────────────────
-- M3 · Discovery rebuild — draft lane + delegation
-- (spec: docs/2026-08-14-canonical-spec-bio-v1.md §2)
--
--   • discovery_sessions — the DRAFT lane. One resumable working copy per
--     brand, edited via autosave WITHOUT creating bios versions or steward
--     jobs. Promotion to a real (candidate) bios version happens only on
--     attest. This is what gives save/resume and kills the abandonment bug
--     (the certified BIO the agents read is never touched by drafts).
--   • discovery_delegations — section-scoped magic links so a colleague can
--     fill one chapter without full workspace membership.
--
-- Both are server-authoritative: RLS enabled, no client policy (the SPA hits
-- /api/discovery/* endpoints; delegation opens via a tokened endpoint the
-- server validates). M1's default-privilege walk-back already removed client
-- writes on future tables.
--
-- NOTE: no bios.status column — the BIO lifecycle is already expressed by
-- certified + self_certified + the draft living here, so a status enum would
-- be redundant.
-- ─────────────────────────────────────────────────────────────────────

create table if not exists discovery_sessions (
  id             uuid primary key default gen_random_uuid(),
  brand_id       uuid not null unique references brands(id) on delete cascade,  -- one active session per brand
  workspace_id   uuid not null references workspaces(id) on delete cascade,
  draft_payload  jsonb not null default '{}'::jsonb,   -- the working BIO draft (normalizeBio shape)
  cursor         jsonb,                                 -- { chapter, field } resume pointer
  chapter_status jsonb,                                 -- per-chapter { status, gaps, inferred } summary
  attested       jsonb not null default '{}'::jsonb,    -- { "voice.forbidden": "accurate", ... } per-field marks
  status         text not null default 'active' check (status in ('active','completed')),
  updated_at     timestamptz not null default now(),
  created_at     timestamptz not null default now()
);
create index if not exists discovery_sessions_ws_idx on discovery_sessions (workspace_id);
alter table discovery_sessions enable row level security;

create table if not exists discovery_delegations (
  id             uuid primary key default gen_random_uuid(),
  brand_id       uuid not null references brands(id) on delete cascade,
  session_id     uuid references discovery_sessions(id) on delete cascade,
  chapter        text not null,                         -- the BIO section delegated (e.g. "visual")
  invitee_email  text not null,
  token          text not null unique,                  -- opaque magic-link token
  status         text not null default 'pending' check (status in ('pending','returned','expired','cancelled')),
  assignee_user_id uuid references users(id) on delete set null,
  note           text,
  created_at     timestamptz not null default now(),
  returned_at    timestamptz
);
create index if not exists discovery_delegations_brand_idx on discovery_delegations (brand_id);
alter table discovery_delegations enable row level security;

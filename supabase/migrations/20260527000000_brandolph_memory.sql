-- ─────────────────────────────────────────────────────────────────────
-- M5 · Brandolph memory
--
-- Two new tables capture per-brand operating signal so Brandolph (L1)
-- can stop running each brief blind to history.
--
--   brand_signals             event log — every approve / flag / edit /
--                              handoff / re-run / refusal-override.
--                              Raw, append-only; powers the admin
--                              audit view + nightly aggregation.
--
--   brand_specialist_stats    rolled-up running stats per (brand,
--                              specialist). Fast read for the
--                              "which specialists are working for
--                              this brand" admin dashboard.
--
-- RLS: brand_signals + brand_specialist_stats both scope on brand_id ∈
-- user's accessible workspaces. Admin role sees everything via service
-- role bypass.
-- ─────────────────────────────────────────────────────────────────────

create table if not exists brand_signals (
  id              uuid primary key default gen_random_uuid(),
  brand_id        uuid not null references brands(id) on delete cascade,
  kind            text not null check (kind in (
    'run.approved',
    'run.flagged',
    'run.failed',
    'run.edited',
    'output.handoff_humans',
    'output.reused',
    'refusal.override',
    'spec.rerun_with_premium',
    'spec.rerun_with_cheap',
    'spec.revision'
  )),
  specialist_id   text,
  run_id          uuid references runs(id) on delete set null,
  output_id       uuid references outputs(id) on delete set null,
  payload         jsonb not null default '{}'::jsonb,
  created_by      uuid references users(id),
  created_at      timestamptz not null default now()
);
create index if not exists brand_signals_brand_idx on brand_signals (brand_id);
create index if not exists brand_signals_kind_idx  on brand_signals (kind);
create index if not exists brand_signals_brand_kind_at_idx on brand_signals (brand_id, kind, created_at desc);

alter table brand_signals enable row level security;

-- Workspace-scoped read access. Admin role bypasses via service role.
create policy brand_signals_select on brand_signals for select
  using (
    brand_id in (
      select b.id from brands b
      join users u on u.workspace_id = b.workspace_id
      where u.id = auth.uid()
    )
  );

-- Writes happen via service role (runs.js) so no public insert policy.

create table if not exists brand_specialist_stats (
  brand_id            uuid not null references brands(id) on delete cascade,
  specialist_id       text not null,
  runs_total          integer not null default 0,
  runs_approved       integer not null default 0,
  runs_flagged        integer not null default 0,
  runs_failed         integer not null default 0,
  runs_edited         integer not null default 0,
  reruns_premium      integer not null default 0,
  reruns_cheap        integer not null default 0,
  revisions           integer not null default 0,
  handoffs_humans     integer not null default 0,
  voice_match_sum     numeric not null default 0,
  voice_match_n       integer not null default 0,
  brand_match_sum     numeric not null default 0,
  brand_match_n       integer not null default 0,
  last_run_at         timestamptz,
  primary key (brand_id, specialist_id)
);

alter table brand_specialist_stats enable row level security;

create policy brand_specialist_stats_select on brand_specialist_stats for select
  using (
    brand_id in (
      select b.id from brands b
      join users u on u.workspace_id = b.workspace_id
      where u.id = auth.uid()
    )
  );

-- Convenience view — derived averages for the admin dashboard.
create or replace view brand_specialist_stats_view as
select
  brand_id,
  specialist_id,
  runs_total,
  runs_approved,
  runs_flagged,
  runs_failed,
  runs_edited,
  reruns_premium,
  reruns_cheap,
  revisions,
  handoffs_humans,
  case when voice_match_n > 0 then round(voice_match_sum / voice_match_n, 1) end as avg_voice_match,
  case when brand_match_n > 0 then round(brand_match_sum / brand_match_n, 1) end as avg_brand_match,
  case when runs_total > 0 then round(100.0 * runs_approved / runs_total, 1) end as approval_pct,
  last_run_at
from brand_specialist_stats;

grant select on brand_signals               to authenticated, service_role;
grant select on brand_specialist_stats      to authenticated, service_role;
grant select on brand_specialist_stats_view to authenticated, service_role;
grant insert, update, delete on brand_signals          to service_role;
grant insert, update, delete on brand_specialist_stats to service_role;

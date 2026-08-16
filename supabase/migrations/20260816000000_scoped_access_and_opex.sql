-- Scoped personas, permission-backed authorization, MFA-sensitive audit trails,
-- and external API OPEX telemetry.

create schema if not exists private;

-- Internal identities are global. Client identities belong to one or more
-- workspaces. `users.role` remains as a compatibility shadow during rollout.
alter table public.users alter column workspace_id drop not null;

create table if not exists public.platform_memberships (
  user_id      uuid primary key references public.users(id) on delete cascade,
  role         text not null check (role in ('super_admin','platform_admin','creative_director','designer')),
  active       boolean not null default true,
  created_by   uuid references public.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.workspace_memberships (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id      uuid not null references public.users(id) on delete cascade,
  role         text not null check (role in ('workspace_admin','user')),
  is_owner     boolean not null default false,
  status       text not null default 'active' check (status in ('active','suspended')),
  invited_by   uuid references public.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create unique index if not exists one_workspace_owner
  on public.workspace_memberships (workspace_id) where is_owner and status = 'active';
create index if not exists workspace_memberships_user_idx
  on public.workspace_memberships (user_id, status);

create table if not exists public.workspace_assignments (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id      uuid not null references public.users(id) on delete cascade,
  assigned_by  uuid references public.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index if not exists workspace_assignments_user_idx on public.workspace_assignments (user_id);

create table if not exists public.role_permissions (
  scope       text not null check (scope in ('platform','workspace')),
  role        text not null,
  permission  text not null,
  primary key (scope, role, permission)
);

create table if not exists public.access_invitations (
  id               uuid primary key default gen_random_uuid(),
  email            text not null,
  workspace_id     uuid references public.workspaces(id) on delete cascade,
  workspace_role   text check (workspace_role in ('workspace_admin','user')),
  platform_role    text check (platform_role in ('platform_admin','creative_director','designer')),
  invited_by       uuid references public.users(id) on delete set null,
  status           text not null default 'pending' check (status in ('pending','accepted','revoked','expired')),
  expires_at       timestamptz not null default now() + interval '7 days',
  accepted_at      timestamptz,
  created_at       timestamptz not null default now(),
  check ((workspace_id is not null and workspace_role is not null and platform_role is null)
      or (workspace_id is null and workspace_role is null and platform_role is not null))
);
create unique index if not exists one_pending_access_invite_per_email_scope
  on public.access_invitations (lower(email), coalesce(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(platform_role, ''))
  where status = 'pending';

create table if not exists public.authorization_audit_events (
  id             uuid primary key default gen_random_uuid(),
  actor_user_id  uuid,
  permission     text not null,
  action         text not null,
  target_type    text,
  target_id      text,
  workspace_id   uuid,
  outcome        text not null check (outcome in ('allowed','denied','failed')),
  reason         text,
  request_id     text,
  prior_state    jsonb,
  new_state      jsonb,
  metadata       jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);
create index if not exists authorization_audit_created_idx
  on public.authorization_audit_events (created_at desc);
create index if not exists authorization_audit_actor_idx
  on public.authorization_audit_events (actor_user_id, created_at desc);

-- Explicit permissions: roles are personas; these rows are the authorization
-- contract shared by the API, UI, tests, and future custom access-token hook.
insert into public.role_permissions (scope, role, permission) values
  ('platform','super_admin','portal.super_admin.access'),
  ('platform','super_admin','portal.admin.access'),
  ('platform','super_admin','portal.team.access'),
  ('platform','super_admin','workspace.read'),
  ('platform','super_admin','workspace.members.manage'),
  ('platform','super_admin','workspace.billing.manage'),
  ('platform','super_admin','workspace.delete'),
  ('platform','super_admin','brand.manage'),
  ('platform','super_admin','bio.read'),
  ('platform','super_admin','bio.propose'),
  ('platform','super_admin','bio.publish'),
  ('platform','super_admin','brief.read'),
  ('platform','super_admin','brief.write'),
  ('platform','super_admin','brief.run'),
  ('platform','super_admin','output.read'),
  ('platform','super_admin','output.write'),
  ('platform','super_admin','output.internal_submit'),
  ('platform','super_admin','output.internal_approve'),
  ('platform','super_admin','output.client_approve'),
  ('platform','super_admin','craft.request'),
  ('platform','super_admin','team.assignments.manage'),
  ('platform','super_admin','platform.workspaces.manage'),
  ('platform','super_admin','platform.people.manage'),
  ('platform','super_admin','platform.roles.manage'),
  ('platform','super_admin','platform.specs.manage'),
  ('platform','super_admin','platform.languages.manage'),
  ('platform','super_admin','platform.memory.read'),
  ('platform','super_admin','audit.read'),
  ('platform','super_admin','opex.read'),
  ('platform','super_admin','opex.export'),
  ('platform','super_admin','opex.budgets.manage'),
  ('platform','super_admin','opex.override'),
  ('platform','platform_admin','portal.admin.access'),
  ('platform','platform_admin','workspace.read'),
  ('platform','platform_admin','workspace.members.manage'),
  ('platform','platform_admin','workspace.billing.manage'),
  ('platform','platform_admin','brand.manage'),
  ('platform','platform_admin','bio.read'),
  ('platform','platform_admin','bio.propose'),
  ('platform','platform_admin','bio.publish'),
  ('platform','platform_admin','brief.read'),
  ('platform','platform_admin','brief.write'),
  ('platform','platform_admin','brief.run'),
  ('platform','platform_admin','output.read'),
  ('platform','platform_admin','output.write'),
  ('platform','platform_admin','output.client_approve'),
  ('platform','platform_admin','craft.request'),
  ('platform','platform_admin','team.assignments.manage'),
  ('platform','platform_admin','platform.workspaces.manage'),
  ('platform','platform_admin','platform.people.manage'),
  ('platform','platform_admin','platform.specs.manage'),
  ('platform','platform_admin','platform.languages.manage'),
  ('platform','platform_admin','platform.memory.read'),
  ('platform','creative_director','portal.team.access'),
  ('platform','creative_director','workspace.read'),
  ('platform','creative_director','brand.manage'),
  ('platform','creative_director','bio.read'),
  ('platform','creative_director','bio.propose'),
  ('platform','creative_director','brief.read'),
  ('platform','creative_director','brief.write'),
  ('platform','creative_director','brief.run'),
  ('platform','creative_director','output.read'),
  ('platform','creative_director','output.write'),
  ('platform','creative_director','output.internal_submit'),
  ('platform','creative_director','output.internal_approve'),
  ('platform','creative_director','craft.request'),
  ('platform','creative_director','team.assignments.manage'),
  ('platform','designer','portal.team.access'),
  ('platform','designer','workspace.read'),
  ('platform','designer','bio.read'),
  ('platform','designer','bio.propose'),
  ('platform','designer','brief.read'),
  ('platform','designer','brief.write'),
  ('platform','designer','brief.run'),
  ('platform','designer','output.read'),
  ('platform','designer','output.write'),
  ('platform','designer','output.internal_submit'),
  ('platform','designer','craft.request'),
  ('workspace','workspace_admin','portal.client.access'),
  ('workspace','workspace_admin','workspace.read'),
  ('workspace','workspace_admin','workspace.members.manage'),
  ('workspace','workspace_admin','workspace.billing.manage'),
  ('workspace','workspace_admin','workspace.delete'),
  ('workspace','workspace_admin','brand.manage'),
  ('workspace','workspace_admin','bio.read'),
  ('workspace','workspace_admin','bio.propose'),
  ('workspace','workspace_admin','bio.publish'),
  ('workspace','workspace_admin','brief.read'),
  ('workspace','workspace_admin','brief.write'),
  ('workspace','workspace_admin','brief.run'),
  ('workspace','workspace_admin','output.read'),
  ('workspace','workspace_admin','output.write'),
  ('workspace','workspace_admin','output.client_approve'),
  ('workspace','workspace_admin','craft.request'),
  ('workspace','user','portal.client.access'),
  ('workspace','user','workspace.read'),
  ('workspace','user','bio.read'),
  ('workspace','user','bio.propose'),
  ('workspace','user','brief.read'),
  ('workspace','user','brief.write'),
  ('workspace','user','brief.run'),
  ('workspace','user','output.read'),
  ('workspace','user','output.write'),
  ('workspace','user','output.client_approve'),
  ('workspace','user','craft.request')
on conflict do nothing;

-- Safe, least-privilege backfill from the compatibility role model.
insert into public.platform_memberships (user_id, role)
select id,
  case role when 'super_admin' then 'super_admin'
            when 'admin' then 'platform_admin'
            else 'designer' end
from public.users
where role in ('super_admin','admin','team')
on conflict (user_id) do nothing;

with ranked as (
  select id as user_id, workspace_id,
         row_number() over (partition by workspace_id order by created_at, id) as position
  from public.users
  where role = 'client' and workspace_id is not null
)
insert into public.workspace_memberships (workspace_id, user_id, role, is_owner)
select workspace_id, user_id,
       case when position = 1 then 'workspace_admin' else 'user' end,
       position = 1
from ranked
on conflict (workspace_id, user_id) do nothing;

-- RLS helpers deliberately query membership tables on every decision so role
-- removal is immediate instead of waiting for a JWT refresh.
create or replace function private.current_user_has_platform_role(requested_roles text[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.platform_memberships pm
    where pm.user_id = (select auth.uid()) and pm.active and pm.role = any(requested_roles)
  );
$$;

create or replace function private.current_user_can_access_workspace(requested_workspace uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select
    private.current_user_has_platform_role(array['super_admin','platform_admin'])
    or exists (
      select 1 from public.workspace_memberships wm
      where wm.user_id = (select auth.uid()) and wm.workspace_id = requested_workspace and wm.status = 'active'
    )
    or exists (
      select 1 from public.workspace_assignments wa
      join public.platform_memberships pm on pm.user_id = wa.user_id and pm.active
      where wa.user_id = (select auth.uid()) and wa.workspace_id = requested_workspace
    );
$$;

create or replace function private.current_user_is_workspace_admin(requested_workspace uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.workspace_memberships wm
    where wm.user_id = (select auth.uid()) and wm.workspace_id = requested_workspace
      and wm.status = 'active' and wm.role = 'workspace_admin'
  );
$$;

create or replace function public.current_user_has_permission(requested_permission text, requested_workspace uuid default null)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.platform_memberships pm
    join public.role_permissions rp on rp.scope = 'platform' and rp.role = pm.role
    where pm.user_id = (select auth.uid()) and pm.active
      and rp.permission = requested_permission
      and (requested_workspace is null
        or pm.role in ('super_admin','platform_admin')
        or exists (
          select 1 from public.workspace_assignments wa
          where wa.user_id = pm.user_id and wa.workspace_id = requested_workspace
        ))
  ) or exists (
    select 1
    from public.workspace_memberships wm
    join public.role_permissions rp on rp.scope = 'workspace' and rp.role = wm.role
    where wm.user_id = (select auth.uid()) and wm.status = 'active'
      and rp.permission = requested_permission
      and (requested_workspace is null or wm.workspace_id = requested_workspace)
  );
$$;

revoke all on function private.current_user_has_platform_role(text[]) from public, anon;
revoke all on function private.current_user_can_access_workspace(uuid) from public, anon;
revoke all on function private.current_user_is_workspace_admin(uuid) from public, anon;
revoke all on function public.current_user_has_permission(text, uuid) from public, anon;
grant usage on schema private to authenticated, service_role;
grant execute on function private.current_user_has_platform_role(text[]) to authenticated, service_role;
grant execute on function private.current_user_can_access_workspace(uuid) to authenticated, service_role;
grant execute on function private.current_user_is_workspace_admin(uuid) to authenticated, service_role;
grant execute on function public.current_user_has_permission(text, uuid) to authenticated, service_role;

-- Replace legacy single-workspace read policies with membership/assignment
-- checks. Browser clients remain read-only from the platform-integrity migration.
drop policy if exists ws_workspaces_read on public.workspaces;
drop policy if exists ws_brands_read on public.brands;
drop policy if exists ws_ledger_read on public.ledger;
drop policy if exists ws_uploads_read on public.uploads;
create policy ws_workspaces_read on public.workspaces for select to authenticated
  using (private.current_user_can_access_workspace(id));
create policy ws_brands_read on public.brands for select to authenticated
  using (private.current_user_can_access_workspace(workspace_id));
create policy ws_ledger_read on public.ledger for select to authenticated
  using (private.current_user_can_access_workspace(workspace_id));
create policy ws_uploads_read on public.uploads for select to authenticated
  using (private.current_user_can_access_workspace(workspace_id));

alter table public.platform_memberships enable row level security;
alter table public.workspace_memberships enable row level security;
alter table public.workspace_assignments enable row level security;
alter table public.role_permissions enable row level security;
alter table public.access_invitations enable row level security;
alter table public.authorization_audit_events enable row level security;

create policy platform_memberships_self_read on public.platform_memberships for select to authenticated
  using (user_id = (select auth.uid()));
create policy workspace_memberships_self_read on public.workspace_memberships for select to authenticated
  using (user_id = (select auth.uid()));
create policy workspace_assignments_self_read on public.workspace_assignments for select to authenticated
  using (user_id = (select auth.uid()));
create policy role_permissions_authenticated_read on public.role_permissions for select to authenticated using (true);

revoke all on table public.platform_memberships, public.workspace_memberships,
  public.workspace_assignments, public.role_permissions, public.access_invitations,
  public.authorization_audit_events from anon, authenticated;
grant select on table public.platform_memberships, public.workspace_memberships,
  public.workspace_assignments, public.role_permissions to authenticated;

-- External API OPEX. Events and adjustments are append-only; rate cards are
-- effective-dated so historical spend never changes when prices do.
create table if not exists public.api_rate_cards (
  id                       uuid primary key default gen_random_uuid(),
  provider                 text not null,
  service                  text not null,
  model                    text,
  operation                text not null default 'request',
  currency                 text not null default 'USD',
  input_per_million_usd    numeric(14,6),
  output_per_million_usd   numeric(14,6),
  cache_read_per_million_usd numeric(14,6),
  cache_write_per_million_usd numeric(14,6),
  unit_name                text,
  unit_cost_usd            numeric(14,8),
  effective_from           timestamptz not null,
  effective_to             timestamptz,
  source_url               text,
  created_by               uuid references public.users(id) on delete set null,
  created_at               timestamptz not null default now(),
  check (effective_to is null or effective_to > effective_from)
);
create index if not exists api_rate_cards_lookup_idx
  on public.api_rate_cards (provider, service, model, operation, effective_from desc);

insert into public.api_rate_cards
  (provider, service, model, operation, input_per_million_usd, output_per_million_usd,
   cache_read_per_million_usd, cache_write_per_million_usd, effective_from, source_url)
values
  ('anthropic','messages','claude-opus-4-7','completion',5,25,0.5,6.25,'2026-08-16T00:00:00Z','https://platform.claude.com/docs/en/about-claude/pricing'),
  ('anthropic','messages','claude-sonnet-4-6','completion',3,15,0.3,3.75,'2026-08-16T00:00:00Z','https://platform.claude.com/docs/en/about-claude/pricing'),
  ('anthropic','messages','claude-haiku-4-5-20251001','completion',1,5,0.1,1.25,'2026-08-16T00:00:00Z','https://platform.claude.com/docs/en/about-claude/pricing'),
  ('fal','image','vendor/fal/flux-1.1-pro','generate',null,null,null,null,'2026-08-16T00:00:00Z','https://fal.ai/models/fal-ai/flux-pro/v1.1'),
  ('fal','image','vendor/fal/flux-schnell','generate',null,null,null,null,'2026-08-16T00:00:00Z','https://fal.ai/docs/model-api-reference/image-generation-api/flux-schnell')
on conflict do nothing;

update public.api_rate_cards set unit_name = 'megapixel', unit_cost_usd = 0.04
where provider = 'fal' and model = 'vendor/fal/flux-1.1-pro' and unit_cost_usd is null;
update public.api_rate_cards set unit_name = 'megapixel', unit_cost_usd = 0.003
where provider = 'fal' and model = 'vendor/fal/flux-schnell' and unit_cost_usd is null;

create table if not exists public.api_budgets (
  id                    uuid primary key default gen_random_uuid(),
  scope_type            text not null check (scope_type in ('platform','provider','workspace','operation')),
  scope_key             text not null,
  monthly_budget_usd    numeric(14,2) check (monthly_budget_usd is null or monthly_budget_usd > 0),
  warn_thresholds       int[] not null default array[70,85,100],
  per_request_ceiling_usd numeric(14,6),
  max_requests_per_minute int,
  active                boolean not null default true,
  created_by            uuid references public.users(id) on delete set null,
  updated_by            uuid references public.users(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (scope_type, scope_key)
);

insert into public.api_budgets
  (scope_type, scope_key, monthly_budget_usd, per_request_ceiling_usd, max_requests_per_minute)
values
  ('operation','specialist.text',null,0.50,60),
  ('operation','specialist.image',null,0.15,20),
  ('operation','discovery.compile',null,1.25,10),
  ('operation','brandolph.ask',null,0.25,30),
  ('operation','brief.sharpen',null,0.25,30)
on conflict (scope_type, scope_key) do nothing;

create table if not exists public.api_usage_events (
  id                    uuid primary key default gen_random_uuid(),
  occurred_at           timestamptz not null default now(),
  request_id            text not null,
  idempotency_key       text,
  parent_run_id         uuid,
  workflow_id           text,
  workspace_id          uuid,
  brand_id              uuid,
  actor_user_id         uuid,
  specialist_id         text,
  feature               text not null,
  environment           text not null default 'production',
  provider              text not null,
  service               text not null,
  requested_model       text,
  resolved_model        text,
  operation             text not null,
  status                text not null check (status in ('succeeded','failed','blocked')),
  retry_number          int not null default 0 check (retry_number >= 0),
  latency_ms            int check (latency_ms is null or latency_ms >= 0),
  input_tokens          bigint not null default 0 check (input_tokens >= 0),
  output_tokens         bigint not null default 0 check (output_tokens >= 0),
  cache_read_tokens     bigint not null default 0 check (cache_read_tokens >= 0),
  cache_write_tokens    bigint not null default 0 check (cache_write_tokens >= 0),
  images                int not null default 0 check (images >= 0),
  pages                 int not null default 0 check (pages >= 0),
  requests              int not null default 1 check (requests >= 0),
  bytes                 bigint not null default 0 check (bytes >= 0),
  units                 jsonb not null default '{}'::jsonb,
  reported_cost_usd     numeric(14,8),
  estimated_cost_usd    numeric(14,8),
  reconciled_cost_usd   numeric(14,8),
  currency              text not null default 'USD',
  cost_source           text not null check (cost_source in ('provider_reported','rate_card_estimate','invoice_reconciled','unpriced')),
  rate_card_id          uuid references public.api_rate_cards(id) on delete set null,
  preflight_max_cost_usd numeric(14,8),
  budget_policy_id      uuid references public.api_budgets(id) on delete set null,
  breaker_decision      text check (breaker_decision in ('allow','block','override')),
  error_code            text,
  metadata              jsonb not null default '{}'::jsonb,
  effective_cost_usd    numeric(14,8) generated always as
    (coalesce(reconciled_cost_usd, reported_cost_usd, estimated_cost_usd, 0)) stored,
  created_at            timestamptz not null default now()
);
create unique index if not exists api_usage_idempotency_uidx
  on public.api_usage_events (idempotency_key) where idempotency_key is not null;
create index if not exists api_usage_time_idx on public.api_usage_events (occurred_at desc);
create index if not exists api_usage_provider_idx on public.api_usage_events (provider, occurred_at desc);
create index if not exists api_usage_workspace_idx on public.api_usage_events (workspace_id, occurred_at desc);
create index if not exists api_usage_feature_idx on public.api_usage_events (feature, occurred_at desc);

create table if not exists public.api_cost_adjustments (
  id             uuid primary key default gen_random_uuid(),
  usage_event_id uuid references public.api_usage_events(id) on delete set null,
  provider       text not null,
  period_start   date not null,
  period_end     date not null,
  amount_usd     numeric(14,8) not null,
  reason         text not null,
  source_ref     text,
  created_by     uuid references public.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  check (period_end >= period_start)
);

alter table public.runs add column if not exists cache_creation_tokens int;
alter table public.outputs add column if not exists workflow_status text not null default 'draft';
alter table public.outputs add column if not exists submitted_by uuid references public.users(id) on delete set null;
alter table public.outputs add column if not exists internal_reviewed_by uuid references public.users(id) on delete set null;
alter table public.outputs add column if not exists internal_reviewed_at timestamptz;
alter table public.outputs add column if not exists client_reviewed_by uuid references public.users(id) on delete set null;
alter table public.outputs add column if not exists client_reviewed_at timestamptz;
alter table public.outputs drop constraint if exists outputs_workflow_status_check;
alter table public.outputs add constraint outputs_workflow_status_check check (workflow_status in (
  'draft','submitted_internal','internally_approved','changes_requested_internal',
  'client_review','client_approved','changes_requested_client'
));

create or replace view public.api_opex_daily as
select date_trunc('day', occurred_at)::date as day,
       provider, service, coalesce(resolved_model, requested_model) as model,
       feature, operation, workspace_id, brand_id, environment, status, cost_source,
       count(*)::bigint as request_count,
       sum(input_tokens)::bigint as input_tokens,
       sum(output_tokens)::bigint as output_tokens,
       sum(cache_read_tokens)::bigint as cache_read_tokens,
       sum(cache_write_tokens)::bigint as cache_write_tokens,
       sum(images)::bigint as images,
       sum(pages)::bigint as pages,
       sum(effective_cost_usd)::numeric(16,8) as cost_usd,
       avg(latency_ms)::numeric(14,2) as avg_latency_ms
from public.api_usage_events
group by 1,2,3,4,5,6,7,8,9,10,11;

alter table public.api_rate_cards enable row level security;
alter table public.api_budgets enable row level security;
alter table public.api_usage_events enable row level security;
alter table public.api_cost_adjustments enable row level security;
revoke all on table public.api_rate_cards, public.api_budgets, public.api_usage_events,
  public.api_cost_adjustments from anon, authenticated;
revoke all on public.api_opex_daily from anon, authenticated;

-- Immutable ledgers. Corrections are represented by new adjustment rows.
create or replace function private.reject_immutable_event_change()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'IMMUTABLE_EVENT';
end;
$$;
drop trigger if exists authorization_audit_immutable on public.authorization_audit_events;
create trigger authorization_audit_immutable before update or delete on public.authorization_audit_events
  for each row execute function private.reject_immutable_event_change();
drop trigger if exists api_usage_immutable on public.api_usage_events;
create trigger api_usage_immutable before update or delete on public.api_usage_events
  for each row execute function private.reject_immutable_event_change();
drop trigger if exists api_adjustment_immutable on public.api_cost_adjustments;
create trigger api_adjustment_immutable before update or delete on public.api_cost_adjustments
  for each row execute function private.reject_immutable_event_change();

-- Invitation-aware provisioning. Direct signups remain self-owned client
-- workspaces; invited users join the intended client or internal scope.
create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = '' as $fn$
declare
  new_workspace_id uuid;
  invite public.access_invitations%rowtype;
  legacy_role text;
  starting_credits int := 300;
begin
  select * into invite from public.access_invitations
  where lower(email) = lower(new.email) and status = 'pending' and expires_at > now()
  order by created_at desc limit 1;

  if invite.id is not null and invite.platform_role is not null then
    legacy_role := case when invite.platform_role = 'platform_admin' then 'admin' else 'team' end;
    insert into public.users (id, workspace_id, email, role)
      values (new.id, null, new.email, legacy_role);
    insert into public.platform_memberships (user_id, role, created_by)
      values (new.id, invite.platform_role, invite.invited_by);
  elsif invite.id is not null and invite.workspace_id is not null then
    insert into public.users (id, workspace_id, email, role)
      values (new.id, invite.workspace_id, new.email, 'client');
    insert into public.workspace_memberships (workspace_id, user_id, role, invited_by)
      values (invite.workspace_id, new.id, invite.workspace_role, invite.invited_by);
  else
    insert into public.workspaces (name, tier)
      values (split_part(new.email, '@', 1) || '''s workspace', '00')
      returning id into new_workspace_id;
    insert into public.users (id, workspace_id, email, role)
      values (new.id, new_workspace_id, new.email, 'client');
    insert into public.workspace_memberships (workspace_id, user_id, role, is_owner)
      values (new_workspace_id, new.id, 'workspace_admin', true);
    insert into public.brands (workspace_id, name) values (new_workspace_id, 'My brand');
    insert into public.ledger (workspace_id, credits, kind, balance_after)
      values (new_workspace_id, -starting_credits, 'monthly_pool', starting_credits);
  end if;

  if invite.id is not null then
    update public.access_invitations set status = 'accepted', accepted_at = now() where id = invite.id;
  end if;
  return new;
end;
$fn$;

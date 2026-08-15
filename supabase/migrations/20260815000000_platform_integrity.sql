-- Platform integrity hardening.
--
-- This migration deliberately corrects the broad bootstrap grants without
-- rewriting historical migrations. Browser clients retain read access to
-- workspace data; all commercial, certification, audit and workflow writes
-- happen through the service-role API or the service-only RPCs below.

-- ---------------------------------------------------------------------------
-- Least privilege for browser roles
-- ---------------------------------------------------------------------------
revoke all on table workspaces, brands, bios, bio_sources, briefs,
  clarifications, runs, outputs, qa_results, ledger, uploads, steward_jobs,
  team_members
  from anon, authenticated;

-- Undo the bootstrap migration's permissive defaults so future tables and
-- functions are not exposed accidentally. Each future migration must grant
-- browser access deliberately.
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on routines from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;

grant select on table workspaces, brands, bios, bio_sources, briefs,
  clarifications, runs, outputs, qa_results, ledger, uploads
  to authenticated;

-- Stewards read the queue through RLS; all queue mutation stays server-side.
grant select on table steward_jobs to authenticated;

-- The browser directory needs presentation fields, not internal compensation
-- or auth-account linkage. Column grants keep hourly_rate_cents and user_id
-- service-side while preserving the existing active-member RLS policy.
grant select (id, name, first_name, avatar_url, roles, active)
  on table team_members to authenticated;

create or replace function current_user_is_steward()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from team_members tm
    where tm.user_id = auth.uid()
      and tm.active = true
      and (tm.roles @> array['steward']::text[] or tm.roles @> array['lead_steward']::text[])
  );
$$;
revoke all on function current_user_is_steward() from public, anon;
grant execute on function current_user_is_steward() to authenticated, service_role;

-- Replace permissive FOR ALL policies with read-only workspace policies.
drop policy if exists ws_brands on brands;
drop policy if exists ws_briefs on briefs;
drop policy if exists ws_bios on bios;
drop policy if exists ws_bio_sources on bio_sources;
drop policy if exists ws_clarifications on clarifications;
drop policy if exists ws_runs on runs;
drop policy if exists ws_outputs on outputs;
drop policy if exists ws_qa_results on qa_results;
drop policy if exists ws_ledger on ledger;
drop policy if exists ws_uploads on uploads;
drop policy if exists ws_workspaces on workspaces;
drop policy if exists steward_role on steward_jobs;

create policy ws_brands_read on brands for select to authenticated
  using (workspace_id = (select workspace_id from users where id = auth.uid()));
create policy ws_briefs_read on briefs for select to authenticated
  using (brand_id in (select id from brands));
create policy ws_bios_read on bios for select to authenticated
  using (brand_id in (select id from brands));
create policy ws_bio_sources_read on bio_sources for select to authenticated
  using (brand_id in (select id from brands));
create policy ws_clarifications_read on clarifications for select to authenticated
  using (brief_id in (select id from briefs));
create policy ws_runs_read on runs for select to authenticated
  using (brief_id in (select id from briefs));
create policy ws_outputs_read on outputs for select to authenticated
  using (brief_id in (select id from briefs));
create policy ws_qa_results_read on qa_results for select to authenticated
  using (output_id in (select id from outputs));
create policy ws_ledger_read on ledger for select to authenticated
  using (workspace_id = (select workspace_id from users where id = auth.uid()));
create policy ws_uploads_read on uploads for select to authenticated
  using (workspace_id = (select workspace_id from users where id = auth.uid()));
create policy ws_workspaces_read on workspaces for select to authenticated
  using (id = (select workspace_id from users where id = auth.uid()));
create policy steward_jobs_read on steward_jobs for select to authenticated
  using (current_user_is_steward());

-- Views are security-definer by default. Recreate this one as invoker so the
-- underlying brand_specialist_stats RLS applies to browser queries.
drop view if exists brand_specialist_stats_view;
create view brand_specialist_stats_view
with (security_invoker = true) as
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
grant select on brand_specialist_stats_view to authenticated, service_role;

-- One open human review per BIO. Clean up historical duplicates before adding
-- the invariant so a deployed project can apply this migration safely.
with ranked as (
  select id, row_number() over (partition by bio_id order by queued_at, id) as rn
  from steward_jobs
  where status in ('queued', 'in_review', 'pending_lead_review')
)
update steward_jobs set status = 'cancelled', completed_at = now()
where id in (select id from ranked where rn > 1);
create unique index if not exists one_open_steward_job_per_bio
  on steward_jobs (bio_id)
  where status in ('queued', 'in_review', 'pending_lead_review');

-- ---------------------------------------------------------------------------
-- Private storage, reproducible on a clean project
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'bio-sources',
  'bio-sources',
  false,
  26214400,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/markdown',
    'image/png',
    'image/jpeg',
    'image/webp'
  ]::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- No browser storage.objects policy is created: the API uploads with the
-- service role and returns short-lived signed URLs on demand.

-- ---------------------------------------------------------------------------
-- Idempotent, locked credit ledger operations
-- ---------------------------------------------------------------------------
alter table ledger add column if not exists idempotency_key text;
create unique index if not exists ledger_idempotency_key_uidx
  on ledger (idempotency_key) where idempotency_key is not null;

create or replace function reserve_workspace_credits(
  p_workspace_id uuid,
  p_amount integer,
  p_idempotency_key text,
  p_kind text default 'reservation',
  p_run_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tier text;
  v_balance integer;
  v_monthly integer;
  v_cap integer;
  v_existing ledger%rowtype;
begin
  if p_amount <= 0 or p_idempotency_key is null or length(p_idempotency_key) = 0 then
    raise exception 'INVALID_CREDIT_RESERVATION' using errcode = '22023';
  end if;

  select tier into v_tier from workspaces where id = p_workspace_id for update;
  if not found then raise exception 'WORKSPACE_NOT_FOUND' using errcode = 'P0002'; end if;

  select * into v_existing from ledger where idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object(
      'ledger_id', v_existing.id,
      'balance_after', v_existing.balance_after,
      'reserved', v_existing.credits,
      'reused', true
    );
  end if;

  select -coalesce(sum(credits), 0)::integer into v_balance
  from ledger where workspace_id = p_workspace_id;

  select coalesce(sum(l.credits), 0)::integer into v_monthly
  from ledger l
  where l.workspace_id = p_workspace_id
    and l.credits > 0
    and l.created_at >= date_trunc('month', now() at time zone 'utc')
    and not exists (
      select 1 from ledger refund
      where refund.workspace_id = l.workspace_id
        and refund.run_id = l.run_id
        and refund.credits = -l.credits
        and refund.kind like '%refund'
    );

  v_cap := case v_tier when '00' then 300 when '01' then 800 when '02' then 1500 else 0 end;
  if v_balance < p_amount then
    raise exception 'OUT_OF_CREDITS' using errcode = 'P0001';
  end if;
  if v_cap > 0 and v_monthly + p_amount > v_cap then
    raise exception 'MONTHLY_CREDIT_CAP' using errcode = 'P0001';
  end if;

  insert into ledger (workspace_id, run_id, credits, kind, balance_after, idempotency_key)
  values (p_workspace_id, p_run_id, p_amount, p_kind, v_balance - p_amount, p_idempotency_key)
  returning * into v_existing;

  return jsonb_build_object(
    'ledger_id', v_existing.id,
    'balance_after', v_existing.balance_after,
    'reserved', p_amount,
    'reused', false
  );
end;
$$;

create or replace function fail_run_and_release_credits(
  p_workspace_id uuid,
  p_run_id uuid,
  p_reservation_key text,
  p_release_key text,
  p_reason text default 'run_refund'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run runs%rowtype;
  v_res ledger%rowtype;
  v_refund ledger%rowtype;
  v_balance integer;
begin
  perform 1 from workspaces where id = p_workspace_id for update;
  if not found then raise exception 'WORKSPACE_NOT_FOUND' using errcode = 'P0002'; end if;

  select r.* into v_run
  from runs r
  join briefs br on br.id = r.brief_id
  join brands b on b.id = br.brand_id
  where r.id = p_run_id and b.workspace_id = p_workspace_id
  for update of r;
  if not found then raise exception 'RUN_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_run.status = 'completed' then
    return jsonb_build_object('failed', false, 'released', false, 'reason', 'run_completed');
  end if;

  select * into v_refund from ledger
  where workspace_id = p_workspace_id and idempotency_key = p_release_key;
  if found then
    update runs set status = 'failed', ended_at = coalesce(ended_at, now()) where id = p_run_id;
    return jsonb_build_object('failed', true, 'released', true, 'reused', true);
  end if;

  select * into v_res from ledger
  where workspace_id = p_workspace_id and idempotency_key = p_reservation_key
  for update;
  if not found then raise exception 'CREDIT_RESERVATION_NOT_FOUND' using errcode = 'P0002'; end if;

  select -coalesce(sum(credits), 0)::integer into v_balance
  from ledger where workspace_id = p_workspace_id;
  insert into ledger (workspace_id, run_id, credits, kind, balance_after, idempotency_key)
  values (p_workspace_id, p_run_id, -v_res.credits, p_reason,
          v_balance + v_res.credits, p_release_key);
  update runs set status = 'failed', ended_at = now() where id = p_run_id;
  return jsonb_build_object(
    'failed', true, 'released', true, 'reused', false,
    'balance_after', v_balance + v_res.credits
  );
end;
$$;

create or replace function release_workspace_credits(
  p_workspace_id uuid,
  p_reservation_key text,
  p_release_key text,
  p_reason text default 'run_refund'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_res ledger%rowtype;
  v_refund ledger%rowtype;
  v_balance integer;
begin
  perform 1 from workspaces where id = p_workspace_id for update;
  select * into v_refund from ledger where idempotency_key = p_release_key;
  if found then return jsonb_build_object('released', true, 'reused', true); end if;

  select * into v_res from ledger
  where workspace_id = p_workspace_id and idempotency_key = p_reservation_key
  for update;
  if not found then return jsonb_build_object('released', false, 'reason', 'reservation_not_found'); end if;

  select -coalesce(sum(credits), 0)::integer into v_balance
  from ledger where workspace_id = p_workspace_id;

  insert into ledger (workspace_id, run_id, credits, kind, balance_after, idempotency_key)
  values (p_workspace_id, v_res.run_id, -v_res.credits, p_reason,
          v_balance + v_res.credits, p_release_key);
  return jsonb_build_object('released', true, 'reused', false, 'balance_after', v_balance + v_res.credits);
end;
$$;

create or replace function finalize_run_atomic(
  p_workspace_id uuid,
  p_run_id uuid,
  p_reservation_key text,
  p_model_used text,
  p_prompt_tokens integer,
  p_completion_tokens integer,
  p_cached_tokens integer,
  p_cost_usd numeric,
  p_latency_ms integer,
  p_output_kind text,
  p_output_body jsonb,
  p_asset_url text,
  p_output_status text,
  p_rationale text,
  p_qa_passed boolean,
  p_qa_evidence text,
  p_ledger_kind text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run runs%rowtype;
  v_output outputs%rowtype;
begin
  select r.* into v_run
  from runs r
  join briefs br on br.id = r.brief_id
  join brands b on b.id = br.brand_id
  where r.id = p_run_id and b.workspace_id = p_workspace_id
  for update of r;
  if not found then raise exception 'RUN_NOT_FOUND' using errcode = 'P0002'; end if;

  select * into v_output from outputs where run_id = p_run_id order by created_at limit 1;
  if found and v_run.status = 'completed' then
    return jsonb_build_object('output_id', v_output.id, 'reused', true);
  end if;
  if v_run.status <> 'running' then
    raise exception 'RUN_NOT_RUNNING' using errcode = 'P0001';
  end if;

  insert into outputs (run_id, brief_id, kind, body, asset_url, status, rationale)
  values (p_run_id, v_run.brief_id, p_output_kind, p_output_body, p_asset_url,
          p_output_status, p_rationale)
  returning * into v_output;

  insert into qa_results (output_id, refusal_id, passed, evidence)
  values (v_output.id, 'voice_qa', p_qa_passed, p_qa_evidence);

  update runs set
    status = 'completed', model_used = p_model_used,
    prompt_tokens = p_prompt_tokens, completion_tokens = p_completion_tokens,
    cached_tokens = p_cached_tokens, cost_usd = p_cost_usd,
    latency_ms = p_latency_ms, ended_at = now()
  where id = p_run_id;

  update ledger set run_id = p_run_id, kind = p_ledger_kind
  where workspace_id = p_workspace_id and idempotency_key = p_reservation_key;
  if not found then raise exception 'CREDIT_RESERVATION_NOT_FOUND' using errcode = 'P0002'; end if;

  return jsonb_build_object('output_id', v_output.id, 'reused', false);
end;
$$;

-- ---------------------------------------------------------------------------
-- Atomic entitlement/workflow helpers
-- ---------------------------------------------------------------------------
alter table bios add column if not exists discovery_id text;
create unique index if not exists bios_discovery_id_uidx
  on bios (discovery_id) where discovery_id is not null;

-- Remove the short-lived four-argument draft if this migration was exercised
-- locally before discovery correlation was added.
drop function if exists append_bio_version(uuid, jsonb, integer, uuid);

create or replace function append_bio_version(
  p_brand_id uuid,
  p_payload jsonb,
  p_score integer,
  p_created_by uuid default null,
  p_discovery_id text default null
)
returns bios
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next_version integer;
  v_bio bios%rowtype;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'INVALID_BIO_PAYLOAD' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('bio:' || p_brand_id::text, 0));
  if not exists (select 1 from brands where id = p_brand_id) then
    raise exception 'BRAND_NOT_FOUND' using errcode = 'P0002';
  end if;
  if p_discovery_id is not null then
    select * into v_bio from bios where discovery_id = p_discovery_id;
    if found then
      if v_bio.brand_id <> p_brand_id then
        raise exception 'DISCOVERY_BRAND_MISMATCH' using errcode = '22023';
      end if;
      return v_bio;
    end if;
  end if;
  select coalesce(max(version), 0) + 1 into v_next_version
  from bios where brand_id = p_brand_id;
  insert into bios (brand_id, version, payload, score, certified, created_by, discovery_id)
  values (p_brand_id, v_next_version, p_payload, p_score, false, p_created_by, p_discovery_id)
  returning * into v_bio;
  return v_bio;
end;
$$;

create or replace function create_brand_with_limit(p_workspace_id uuid, p_name text)
returns brands
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tier text;
  v_count integer;
  v_limit integer;
  v_brand brands%rowtype;
begin
  select tier into v_tier from workspaces where id = p_workspace_id for update;
  if not found then raise exception 'WORKSPACE_NOT_FOUND' using errcode = 'P0002'; end if;
  select count(*)::integer into v_count from brands where workspace_id = p_workspace_id;
  v_limit := case v_tier when '00' then 1 when '01' then 2 when '02' then 3 else null end;
  if v_limit is not null and v_count >= v_limit then
    raise exception 'BRAND_LIMIT' using errcode = 'P0001';
  end if;
  insert into brands (workspace_id, name) values (p_workspace_id, trim(p_name)) returning * into v_brand;
  return v_brand;
end;
$$;

create or replace function switch_active_spec_version(p_specialist_id text, p_payload jsonb)
returns specs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current specs%rowtype;
  v_new specs%rowtype;
  v_was_active boolean;
begin
  perform pg_advisory_xact_lock(hashtextextended('spec:' || p_specialist_id, 0));
  select * into v_current from specs
  where specialist_id = p_specialist_id
  order by version desc limit 1 for update;
  if not found then raise exception 'SPEC_NOT_FOUND' using errcode = 'P0002'; end if;
  select exists (
    select 1 from specs where specialist_id = p_specialist_id and active = true
  ) into v_was_active;
  update specs set active = false where specialist_id = p_specialist_id and active = true;
  insert into specs (specialist_id, version, payload, active)
  values (p_specialist_id, v_current.version + 1, v_current.payload || p_payload, v_was_active)
  returning * into v_new;
  return v_new;
end;
$$;

create or replace function request_craft_atomic(
  p_workspace_id uuid,
  p_user_id uuid,
  p_output_id uuid,
  p_slot integer,
  p_notes text,
  p_credits integer,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tier text;
  v_output outputs%rowtype;
  v_body jsonb;
  v_items jsonb;
  v_item jsonb;
  v_craft jsonb;
  v_balance integer;
  v_monthly integer;
  v_cap integer;
  v_attempt integer;
  v_ledger_key text;
begin
  select w.tier into v_tier from workspaces w where w.id = p_workspace_id for update;
  if v_tier is null or v_tier < '02' then raise exception 'CRAFT_TIER_LOCKED' using errcode = 'P0001'; end if;

  select o.* into v_output
  from outputs o
  join briefs br on br.id = o.brief_id
  join brands b on b.id = br.brand_id
  where o.id = p_output_id and b.workspace_id = p_workspace_id
  for update of o;
  if not found then raise exception 'OUTPUT_NOT_FOUND' using errcode = 'P0002'; end if;

  v_body := coalesce(v_output.body, '{}'::jsonb);
  v_items := v_body->'deliverables';
  if jsonb_typeof(v_items) <> 'array' or p_slot < 0 or p_slot >= jsonb_array_length(v_items) then
    raise exception 'DELIVERABLE_NOT_FOUND' using errcode = 'P0002';
  end if;
  v_item := v_items->p_slot;
  if v_item->'craft' is not null and coalesce(v_item->'craft'->>'status', '') <> 'cancelled' then
    raise exception 'CRAFT_ALREADY_REQUESTED' using errcode = 'P0001';
  end if;

  select -coalesce(sum(credits), 0)::integer into v_balance from ledger where workspace_id = p_workspace_id;
  select coalesce(sum(l.credits), 0)::integer into v_monthly from ledger l
    where l.workspace_id = p_workspace_id and l.credits > 0
      and l.created_at >= date_trunc('month', now() at time zone 'utc')
      and not exists (
        select 1 from ledger refund
        where refund.workspace_id = l.workspace_id
          and refund.run_id = l.run_id
          and refund.credits = -l.credits
          and refund.kind like '%refund'
      );
  v_cap := case v_tier when '00' then 300 when '01' then 800 when '02' then 1500 else 0 end;
  if v_balance < p_credits then raise exception 'OUT_OF_CREDITS' using errcode = 'P0001'; end if;
  if v_cap > 0 and v_monthly + p_credits > v_cap then raise exception 'MONTHLY_CREDIT_CAP' using errcode = 'P0001'; end if;

  v_attempt := case
    when coalesce(v_item->'craft'->>'status', '') = 'cancelled'
      then coalesce((v_item->'craft'->>'attempt')::integer, 1) + 1
    else 1
  end;
  v_ledger_key := case when v_attempt = 1 then p_idempotency_key
    else p_idempotency_key || ':attempt:' || v_attempt::text end;
  v_craft := jsonb_build_object(
    'status', 'queued', 'notes', left(coalesce(p_notes, ''), 2000),
    'credits', p_credits, 'requested_at', now(), 'requested_by', p_user_id,
    'delivered', null, 'attempt', v_attempt
  );
  v_item := v_item || jsonb_build_object('craft', v_craft);
  v_items := jsonb_set(v_items, array[p_slot::text], v_item, false);
  update outputs set body = jsonb_set(v_body, '{deliverables}', v_items, true) where id = p_output_id;

  insert into ledger (workspace_id, credits, kind, balance_after, idempotency_key)
  values (p_workspace_id, p_credits, 'craft', v_balance - p_credits, v_ledger_key);
  return jsonb_build_object('craft', v_craft, 'balance_after', v_balance - p_credits);
end;
$$;

create or replace function submit_steward_job_atomic(
  p_job_id uuid,
  p_steward_id uuid,
  p_is_lead boolean,
  p_calibration boolean,
  p_status text,
  p_candidate_payload jsonb default null,
  p_candidate_score integer default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job steward_jobs%rowtype;
  v_source bios%rowtype;
  v_candidate bios%rowtype;
  v_needs_lead boolean;
  v_final boolean;
  v_next_version integer;
begin
  select * into v_job from steward_jobs where id = p_job_id for update;
  if not found then raise exception 'JOB_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_job.status = 'completed' then raise exception 'JOB_ALREADY_COMPLETED' using errcode = 'P0001'; end if;
  if v_job.status = 'cancelled' then raise exception 'JOB_CANCELLED' using errcode = 'P0001'; end if;
  if v_job.status not in ('queued', 'in_review') then
    raise exception 'JOB_NOT_SUBMITTABLE' using errcode = 'P0001';
  end if;
  if v_job.assigned_to is not null and v_job.assigned_to <> p_steward_id then
    raise exception 'JOB_ASSIGNED_TO_ANOTHER_STEWARD' using errcode = '42501';
  end if;
  if p_status not in ('completed', 'cancelled') then
    raise exception 'INVALID_JOB_STATUS' using errcode = '22023';
  end if;

  if p_status = 'cancelled' then
    update steward_jobs set status = 'cancelled', completed_at = now(), assigned_to = p_steward_id
    where id = p_job_id;
    return jsonb_build_object('status', 'cancelled');
  end if;

  v_needs_lead := p_calibration and not p_is_lead;
  v_final := not v_needs_lead;

  select * into v_source from bios where id = v_job.bio_id for update;
  if not found then raise exception 'BIO_NOT_FOUND' using errcode = 'P0002'; end if;

  if p_candidate_payload is not null then
    perform pg_advisory_xact_lock(hashtextextended('bio:' || v_source.brand_id::text, 0));
    select coalesce(max(version), 0) + 1 into v_next_version
    from bios where brand_id = v_source.brand_id;
    insert into bios (
      brand_id, version, payload, score, certified, certified_by,
      certified_at, cert_kind, steward_notes
    ) values (
      v_source.brand_id, v_next_version, v_source.payload || p_candidate_payload,
      coalesce(p_candidate_score, v_source.score), v_final,
      case when v_final then p_steward_id end,
      case when v_final then now() end,
      case when v_final then v_job.kind end,
      p_notes
    ) returning * into v_candidate;
  else
    update bios set
      certified = v_final,
      certified_by = case when v_final then p_steward_id end,
      certified_at = case when v_final then now() end,
      cert_kind = case when v_final then v_job.kind end,
      steward_notes = p_notes
    where id = v_source.id
    returning * into v_candidate;
  end if;

  update steward_jobs set
    bio_id = v_candidate.id,
    status = case when v_needs_lead then 'pending_lead_review' else 'completed' end,
    completed_at = case when v_final then now() end,
    assigned_to = p_steward_id
  where id = p_job_id;

  return jsonb_build_object(
    'status', case when v_needs_lead then 'pending_lead_review' else 'completed' end,
    'bio_id', v_candidate.id,
    'version', v_candidate.version,
    'needs_lead_approval', v_needs_lead,
    'certified', v_final
  );
end;
$$;

create or replace function review_steward_job_atomic(
  p_job_id uuid,
  p_lead_id uuid,
  p_approve boolean,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job steward_jobs%rowtype;
  v_bio bios%rowtype;
begin
  select * into v_job from steward_jobs where id = p_job_id for update;
  if not found then raise exception 'JOB_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_job.status <> 'pending_lead_review' then
    raise exception 'JOB_NOT_PENDING_LEAD_REVIEW' using errcode = 'P0001';
  end if;
  select * into v_bio from bios where id = v_job.bio_id for update;
  if not found then raise exception 'BIO_NOT_FOUND' using errcode = 'P0002'; end if;

  if not p_approve then
    update bios set certified = false, certified_by = null, certified_at = null, cert_kind = null
    where id = v_bio.id;
    update steward_jobs set
      status = 'in_review', lead_reviewed_by = p_lead_id,
      lead_reviewed_at = now(), completed_at = null,
      override_reason = case when p_notes is not null then 'lead_reject: ' || left(p_notes, 1000) else 'lead_reject' end
    where id = p_job_id;
    return jsonb_build_object('status', 'in_review', 'action', 'sent_back', 'bio_id', v_bio.id, 'version', v_bio.version);
  end if;

  update bios set
    certified = true,
    certified_by = v_job.assigned_to,
    certified_at = now(),
    cert_kind = v_job.kind,
    steward_notes = coalesce(p_notes, steward_notes)
  where id = v_bio.id;
  update steward_jobs set
    status = 'completed', completed_at = now(),
    lead_reviewed_by = p_lead_id, lead_reviewed_at = now()
  where id = p_job_id;
  return jsonb_build_object('status', 'completed', 'action', 'approved', 'bio_id', v_bio.id, 'version', v_bio.version);
end;
$$;

-- Stripe event ledger: the primary key makes webhook processing idempotent.
create table if not exists billing_events (
  id text primary key,
  type text not null,
  payload jsonb not null,
  processing_started_at timestamptz,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);
alter table billing_events add column if not exists processing_started_at timestamptz;
alter table billing_events enable row level security;
revoke all on billing_events from anon, authenticated;

create or replace function claim_billing_event(p_id text, p_type text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event billing_events%rowtype;
begin
  insert into billing_events (id, type, payload, processing_started_at)
  values (p_id, p_type, p_payload, now())
  on conflict (id) do nothing
  returning * into v_event;
  if found then return jsonb_build_object('claimed', true, 'processed', false); end if;

  select * into v_event from billing_events where id = p_id for update;
  if v_event.processed_at is not null then
    return jsonb_build_object('claimed', false, 'processed', true);
  end if;
  if v_event.processing_started_at is null
     or v_event.processing_started_at < now() - interval '5 minutes' then
    update billing_events set processing_started_at = now(), type = p_type, payload = p_payload
    where id = p_id;
    return jsonb_build_object('claimed', true, 'processed', false, 'reclaimed', true);
  end if;
  return jsonb_build_object('claimed', false, 'processed', false);
end;
$$;

-- Service-only execution of privileged RPCs.
revoke all on function reserve_workspace_credits(uuid, integer, text, text, uuid) from public, anon, authenticated;
revoke all on function release_workspace_credits(uuid, text, text, text) from public, anon, authenticated;
revoke all on function fail_run_and_release_credits(uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function finalize_run_atomic(uuid, uuid, text, text, integer, integer, integer, numeric, integer, text, jsonb, text, text, text, boolean, text, text) from public, anon, authenticated;
revoke all on function append_bio_version(uuid, jsonb, integer, uuid, text) from public, anon, authenticated;
revoke all on function create_brand_with_limit(uuid, text) from public, anon, authenticated;
revoke all on function switch_active_spec_version(text, jsonb) from public, anon, authenticated;
revoke all on function request_craft_atomic(uuid, uuid, uuid, integer, text, integer, text) from public, anon, authenticated;
revoke all on function submit_steward_job_atomic(uuid, uuid, boolean, boolean, text, jsonb, integer, text) from public, anon, authenticated;
revoke all on function review_steward_job_atomic(uuid, uuid, boolean, text) from public, anon, authenticated;
revoke all on function claim_billing_event(text, text, jsonb) from public, anon, authenticated;

grant execute on function reserve_workspace_credits(uuid, integer, text, text, uuid) to service_role;
grant execute on function release_workspace_credits(uuid, text, text, text) to service_role;
grant execute on function fail_run_and_release_credits(uuid, uuid, text, text, text) to service_role;
grant execute on function finalize_run_atomic(uuid, uuid, text, text, integer, integer, integer, numeric, integer, text, jsonb, text, text, text, boolean, text, text) to service_role;
grant execute on function append_bio_version(uuid, jsonb, integer, uuid, text) to service_role;
grant execute on function create_brand_with_limit(uuid, text) to service_role;
grant execute on function switch_active_spec_version(text, jsonb) to service_role;
grant execute on function request_craft_atomic(uuid, uuid, uuid, integer, text, integer, text) to service_role;
grant execute on function submit_steward_job_atomic(uuid, uuid, boolean, boolean, text, jsonb, integer, text) to service_role;
grant execute on function review_steward_job_atomic(uuid, uuid, boolean, text) to service_role;
grant execute on function claim_billing_event(text, text, jsonb) to service_role;

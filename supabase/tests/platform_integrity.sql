begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select no_plan();

-- ---------------------------------------------------------------------------
-- Migration boundary: browser roles are read-only and tenant tables use RLS.
-- ---------------------------------------------------------------------------
select ok(
  not has_table_privilege('authenticated', 'public.workspaces', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.brands', 'INSERT')
  and not has_table_privilege('authenticated', 'public.bios', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.ledger', 'INSERT')
  and not has_table_privilege('authenticated', 'public.runs', 'DELETE')
  and not has_table_privilege('authenticated', 'public.steward_jobs', 'UPDATE'),
  'authenticated cannot mutate commercial, certification, audit, or workflow tables'
);

select ok(
  has_column_privilege('authenticated', 'public.team_members', 'name', 'SELECT')
  and not has_column_privilege('authenticated', 'public.team_members', 'user_id', 'SELECT')
  and not has_column_privilege('authenticated', 'public.team_members', 'hourly_rate_cents', 'SELECT'),
  'authenticated sees the team directory without private linkage or compensation fields'
);

select ok(
  (
    select bool_and(c.relrowsecurity)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = any (array[
        'workspaces', 'brands', 'bios', 'bio_sources', 'briefs', 'runs',
        'outputs', 'qa_results', 'ledger', 'uploads', 'steward_jobs'
      ])
  ),
  'all tenant and workflow tables have RLS enabled'
);

select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'public'
      and tablename = any (array[
        'workspaces', 'brands', 'bios', 'bio_sources', 'briefs', 'runs',
        'outputs', 'qa_results', 'ledger', 'uploads', 'steward_jobs'
      ])
      and cmd <> 'SELECT'
  ),
  0,
  'tenant-facing RLS policies expose no browser writes'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.reserve_workspace_credits(uuid,integer,text,text,uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.finalize_run_atomic(uuid,uuid,text,text,integer,integer,integer,numeric,integer,text,jsonb,text,text,text,boolean,text,text)',
    'EXECUTE'
  )
  and not has_function_privilege('authenticated', 'public.append_bio_version(uuid,jsonb,integer,uuid,text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.create_brand_with_limit(uuid,text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.switch_active_spec_version(text,jsonb)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.request_craft_atomic(uuid,uuid,uuid,integer,text,integer,text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.submit_steward_job_atomic(uuid,uuid,boolean,boolean,text,jsonb,integer,text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.review_steward_job_atomic(uuid,uuid,boolean,text)', 'EXECUTE')
  and has_function_privilege(
    'service_role',
    'public.reserve_workspace_credits(uuid,integer,text,text,uuid)',
    'EXECUTE'
  ),
  'privileged workflow RPCs are unavailable to authenticated and executable by service role'
);

select ok(
  coalesce(
    (
      select c.reloptions @> array['security_invoker=true']::text[]
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = 'brand_specialist_stats_view'
    ),
    false
  ),
  'brand specialist stats view executes with invoker security'
);

select ok(
  exists (
    select 1
    from storage.buckets
    where id = 'bio-sources'
      and name = 'bio-sources'
      and public = false
      and file_size_limit = 26214400
  ),
  'private bio-sources bucket is reproducibly provisioned'
);

-- ---------------------------------------------------------------------------
-- Fixtures. Fixed UUIDs make failures easy to inspect in a retained database.
-- The surrounding transaction is rolled back at the end.
-- ---------------------------------------------------------------------------
insert into workspaces (id, name, tier) values
  ('10000000-0000-0000-0000-000000000001', 'Integrity Unlimited', '03'),
  ('10000000-0000-0000-0000-000000000002', 'Integrity Brand Limit', '01'),
  ('10000000-0000-0000-0000-000000000003', 'Integrity Craft', '02');

insert into brands (id, workspace_id, name) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Integrity Brand'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'Existing Limited Brand'),
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000003', 'Craft Brand');

insert into ledger (workspace_id, credits, kind, balance_after, idempotency_key) values
  ('10000000-0000-0000-0000-000000000001', -200, 'test_grant', 200, 'test:grant:main'),
  ('10000000-0000-0000-0000-000000000003', -100, 'test_grant', 100, 'test:grant:craft');

-- ---------------------------------------------------------------------------
-- Credit reservation, refund, and idempotency.
-- ---------------------------------------------------------------------------
select lives_ok(
  $$select reserve_workspace_credits(
    '10000000-0000-0000-0000-000000000001', 40, 'test:reserve:one',
    'run_reserved', null
  )$$,
  'first credit reservation succeeds'
);

select is(
  (reserve_workspace_credits(
    '10000000-0000-0000-0000-000000000001', 40, 'test:reserve:one',
    'run_reserved', null
  )->>'reused')::boolean,
  true,
  'repeating a reservation reuses the existing ledger row'
);

select is(
  (select count(*)::integer from ledger where idempotency_key = 'test:reserve:one'),
  1,
  'reservation idempotency key produces exactly one debit'
);

select lives_ok(
  $$select release_workspace_credits(
    '10000000-0000-0000-0000-000000000001',
    'test:reserve:one', 'test:reserve:one:refund', 'run_refund'
  )$$,
  'credit reservation can be refunded'
);

select is(
  (release_workspace_credits(
    '10000000-0000-0000-0000-000000000001',
    'test:reserve:one', 'test:reserve:one:refund', 'run_refund'
  )->>'reused')::boolean,
  true,
  'repeating a refund reuses the compensating row'
);

select is(
  (select count(*)::integer from ledger where idempotency_key = 'test:reserve:one:refund'),
  1,
  'refund idempotency key produces exactly one credit'
);

select is(
  (select -sum(credits)::integer from ledger where workspace_id = '10000000-0000-0000-0000-000000000001'),
  200,
  'reservation followed by refund restores the original balance'
);

-- Failed runs settle their terminal state and refund in one transaction; the
-- refunded reservation must not continue consuming the monthly allowance.
insert into workspaces (id, name, tier)
values ('10000000-0000-0000-0000-000000000004', 'Integrity Refund Cap', '00');
insert into brands (id, workspace_id, name)
values ('20000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000004', 'Refund Brand');
insert into ledger (workspace_id, credits, kind, balance_after, idempotency_key)
values ('10000000-0000-0000-0000-000000000004', -700, 'test_grant', 700, 'test:grant:refund');
insert into briefs (id, brand_id, title, status)
values ('30000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000004', 'Refunded run', 'active');
insert into runs (id, brief_id, specialist_id, spec_version, bio_version, status)
values ('40000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000004', 'test-integrity', 1, 1, 'running');
select reserve_workspace_credits(
  '10000000-0000-0000-0000-000000000004', 300, 'test:failed:reserve',
  'run_reserved', '40000000-0000-0000-0000-000000000004'
);
select lives_ok(
  $$select fail_run_and_release_credits(
    '10000000-0000-0000-0000-000000000004',
    '40000000-0000-0000-0000-000000000004',
    'test:failed:reserve', 'test:failed:refund', 'run_refund'
  )$$,
  'failed run and refund settle atomically'
);
select is((select status from runs where id = '40000000-0000-0000-0000-000000000004'), 'failed', 'failed settlement marks the run failed');
select is((select count(*)::integer from ledger where idempotency_key = 'test:failed:refund'), 1, 'failed settlement writes one refund');
select lives_ok(
  $$select reserve_workspace_credits(
    '10000000-0000-0000-0000-000000000004', 300, 'test:after:refund',
    'run_reserved', null
  )$$,
  'refunded reservation no longer consumes the monthly cap'
);

-- ---------------------------------------------------------------------------
-- Atomic run finalization is retry-safe.
-- ---------------------------------------------------------------------------
insert into briefs (id, brand_id, title, status)
values ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Integrity run', 'active');

insert into runs (id, brief_id, specialist_id, spec_version, bio_version, status)
values ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'test-integrity', 1, 1, 'running');

select lives_ok(
  $$select reserve_workspace_credits(
    '10000000-0000-0000-0000-000000000001', 30, 'test:run:credits',
    'run_reserved', '40000000-0000-0000-0000-000000000001'
  )$$,
  'run credits reserve before finalization'
);

select lives_ok(
  $$select finalize_run_atomic(
    '10000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000001', 'test:run:credits',
    'test/model', 10, 20, 0, 0.0100, 25,
    'copy', '{"text":"finalized"}'::jsonb, null,
    'approved', null, true, null, 'run'
  )$$,
  'first run finalization succeeds'
);

select is(
  (finalize_run_atomic(
    '10000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000001', 'test:run:credits',
    'test/model', 10, 20, 0, 0.0100, 25,
    'copy', '{"text":"finalized"}'::jsonb, null,
    'approved', null, true, null, 'run'
  )->>'reused')::boolean,
  true,
  'repeating run finalization returns the persisted output'
);

select is((select count(*)::integer from outputs where run_id = '40000000-0000-0000-0000-000000000001'), 1, 'run retry creates one output');
select is((select count(*)::integer from qa_results q join outputs o on o.id = q.output_id where o.run_id = '40000000-0000-0000-0000-000000000001'), 1, 'run retry creates one QA row');
select is((select status from runs where id = '40000000-0000-0000-0000-000000000001'), 'completed', 'finalized run is completed');
select is((select kind from ledger where idempotency_key = 'test:run:credits'), 'run', 'reservation is settled to the final ledger kind');

-- ---------------------------------------------------------------------------
-- Brand, spec, and BIO version helpers preserve invariants.
-- ---------------------------------------------------------------------------
select lives_ok(
  $$select create_brand_with_limit(
    '10000000-0000-0000-0000-000000000002', 'Second Allowed Brand'
  )$$,
  'brand helper inserts up to the tier limit'
);

select throws_ok(
  $$select create_brand_with_limit(
    '10000000-0000-0000-0000-000000000002', 'Third Blocked Brand'
  )$$,
  'P0001',
  'BRAND_LIMIT',
  'brand helper rejects an insert beyond the tier limit'
);

insert into specs (specialist_id, version, payload, active)
values ('test-integrity', 1, '{"name":"Original","department":"strategy"}'::jsonb, true);

select lives_ok(
  $$select switch_active_spec_version('test-integrity', '{"name":"Revised"}'::jsonb)$$,
  'spec helper creates a new version'
);

select is((select max(version) from specs where specialist_id = 'test-integrity'), 2, 'spec version increments');
select is((select count(*)::integer from specs where specialist_id = 'test-integrity' and active), 1, 'exactly one spec version remains active');
select is((select payload->>'department' from specs where specialist_id = 'test-integrity' and version = 2), 'strategy', 'spec patch retains untouched payload fields');
select is((select payload->>'name' from specs where specialist_id = 'test-integrity' and version = 2), 'Revised', 'spec patch replaces requested fields');

update specs set active = false where specialist_id = 'test-integrity';
update specs set active = true where specialist_id = 'test-integrity' and version = 1;
select lives_ok(
  $$select switch_active_spec_version('test-integrity', '{"name":"After rollback"}'::jsonb)$$,
  'spec edit after rollback keeps the specialist active'
);
select is((select count(*)::integer from specs where specialist_id = 'test-integrity' and active), 1, 'rollback edit leaves exactly one active spec');
select is((select version from specs where specialist_id = 'test-integrity' and active), 3, 'rollback edit activates the new version');

select lives_ok(
  $$select append_bio_version(
    '20000000-0000-0000-0000-000000000001',
    '{"identity":{"name":"One"}}'::jsonb, 50, null
  )$$,
  'BIO append helper creates the first version'
);

select lives_ok(
  $$select append_bio_version(
    '20000000-0000-0000-0000-000000000001',
    '{"identity":{"name":"Two"}}'::jsonb, 60, null
  )$$,
  'BIO append helper creates the next version'
);

select results_eq(
  $$select version from bios where brand_id = '20000000-0000-0000-0000-000000000001' order by version$$,
  $$values (1), (2)$$,
  'BIO helper assigns contiguous versions'
);

select append_bio_version(
  '20000000-0000-0000-0000-000000000001',
  '{"identity":{"name":"Discovery"}}'::jsonb, 70, null, 'discovery:test:one'
);
select append_bio_version(
  '20000000-0000-0000-0000-000000000001',
  '{"identity":{"name":"Discovery retry"}}'::jsonb, 71, null, 'discovery:test:one'
);
select is((select count(*)::integer from bios where discovery_id = 'discovery:test:one'), 1, 'Discovery correlation makes BIO append retries idempotent');

-- ---------------------------------------------------------------------------
-- Steward candidate produced from a partial edit + calibrated lead approval.
-- The route owns recursive patch merging; this RPC contract receives the full
-- merged candidate and must preserve it through the human-review transition.
-- ---------------------------------------------------------------------------
insert into team_members (id, name, first_name, roles, active) values
  ('50000000-0000-0000-0000-000000000001', 'Integrity Steward', 'Steward', array['steward'], true),
  ('50000000-0000-0000-0000-000000000002', 'Integrity Lead', 'Lead', array['lead_steward'], true);

insert into bios (id, brand_id, version, payload, score, certified)
values (
  '60000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000003',
  1,
  '{"identity":{"name":"Keep me"},"voice":{"tone":"old"},"visual":{"palette":["#000000"]}}'::jsonb,
  70,
  false
);

insert into steward_jobs (id, bio_id, brand_id, kind, status, assigned_to)
values (
  '70000000-0000-0000-0000-000000000001',
  '60000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000003',
  'drift_check',
  'in_review',
  '50000000-0000-0000-0000-000000000001'
);

select lives_ok(
  $$select submit_steward_job_atomic(
    '70000000-0000-0000-0000-000000000001',
    '50000000-0000-0000-0000-000000000001',
    false, true, 'completed',
    '{"identity":{"name":"Keep me"},"voice":{"tone":"new"},"visual":{"palette":["#000000"]}}'::jsonb,
    80, 'partial edit'
  )$$,
  'non-lead Steward submits the merged candidate for calibration'
);

select is(
  (
    select b.payload->'identity'->>'name'
    from steward_jobs j join bios b on b.id = j.bio_id
    where j.id = '70000000-0000-0000-0000-000000000001'
  ),
  'Keep me',
  'merged Steward candidate retains untouched BIO sections'
);

select is(
  (
    select b.payload->'voice'->>'tone'
    from steward_jobs j join bios b on b.id = j.bio_id
    where j.id = '70000000-0000-0000-0000-000000000001'
  ),
  'new',
  'merged Steward candidate applies edited BIO sections'
);

select is(
  (select status from steward_jobs where id = '70000000-0000-0000-0000-000000000001'),
  'pending_lead_review',
  'calibrated submission waits for lead approval'
);

select ok(
  not (
    select b.certified
    from steward_jobs j join bios b on b.id = j.bio_id
    where j.id = '70000000-0000-0000-0000-000000000001'
  ),
  'candidate is not certified before lead approval'
);

select lives_ok(
  $$select review_steward_job_atomic(
    '70000000-0000-0000-0000-000000000001',
    '50000000-0000-0000-0000-000000000002', true, 'approved'
  )$$,
  'lead approves the calibrated candidate'
);

select is(
  (select status from steward_jobs where id = '70000000-0000-0000-0000-000000000001'),
  'completed',
  'lead approval completes the Steward job'
);

select ok(
  (
    select b.certified
      and b.certified_by = '50000000-0000-0000-0000-000000000001'::uuid
      and j.lead_reviewed_by = '50000000-0000-0000-0000-000000000002'::uuid
    from steward_jobs j join bios b on b.id = j.bio_id
    where j.id = '70000000-0000-0000-0000-000000000001'
  ),
  'lead approval certifies the candidate while preserving Steward attribution'
);

insert into steward_jobs (id, bio_id, brand_id, kind, status)
select
  '70000000-0000-0000-0000-000000000002', id,
  '20000000-0000-0000-0000-000000000001', 'drift_check', 'queued'
from bios where brand_id = '20000000-0000-0000-0000-000000000001' order by version desc limit 1;
select submit_steward_job_atomic(
  '70000000-0000-0000-0000-000000000002',
  '50000000-0000-0000-0000-000000000001', false, true, 'cancelled', null, null, 'cancel'
);
select throws_ok(
  $$select submit_steward_job_atomic(
    '70000000-0000-0000-0000-000000000002',
    '50000000-0000-0000-0000-000000000001', false, true, 'completed', null, null, null
  )$$,
  'P0001', 'JOB_CANCELLED',
  'cancelled Steward jobs are terminal'
);

select is((claim_billing_event('evt_integrity', 'test.event', '{}'::jsonb)->>'claimed')::boolean, true, 'first webhook delivery claims its event');
select is((claim_billing_event('evt_integrity', 'test.event', '{}'::jsonb)->>'claimed')::boolean, false, 'concurrent webhook duplicate cannot claim the event');
select is((select count(*)::integer from billing_events where id = 'evt_integrity'), 1, 'billing claim persists one event row');

-- ---------------------------------------------------------------------------
-- Craft retry is safe: the current contract rejects the retry, but must not
-- duplicate either the body mutation or the credit debit.
-- ---------------------------------------------------------------------------
insert into briefs (id, brand_id, title, status)
values ('30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000003', 'Integrity craft', 'active');

insert into runs (id, brief_id, specialist_id, spec_version, bio_version, status)
values ('40000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000003', 'test-integrity', 2, 1, 'completed');

insert into outputs (id, run_id, brief_id, kind, body, status)
values (
  '80000000-0000-0000-0000-000000000003',
  '40000000-0000-0000-0000-000000000003',
  '30000000-0000-0000-0000-000000000003',
  'deliverables',
  '{"deliverables":[{"title":"One","body":"Draft"}]}'::jsonb,
  'approved'
);

select lives_ok(
  $$select request_craft_atomic(
    '10000000-0000-0000-0000-000000000003',
    '50000000-0000-0000-0000-000000000001',
    '80000000-0000-0000-0000-000000000003', 0, 'Polish this', 40,
    'test:craft:one'
  )$$,
  'first craft request succeeds'
);

select throws_ok(
  $$select request_craft_atomic(
    '10000000-0000-0000-0000-000000000003',
    '50000000-0000-0000-0000-000000000001',
    '80000000-0000-0000-0000-000000000003', 0, 'Polish this', 40,
    'test:craft:one'
  )$$,
  'P0001',
  'CRAFT_ALREADY_REQUESTED',
  'craft retry is rejected deterministically'
);

select is((select count(*)::integer from ledger where idempotency_key = 'test:craft:one'), 1, 'craft retry creates one debit');
select is(
  (select body->'deliverables'->0->'craft'->>'status' from outputs where id = '80000000-0000-0000-0000-000000000003'),
  'queued',
  'craft retry leaves the original queued mutation intact'
);

update outputs
set body = jsonb_set(body, '{deliverables,0,craft,status}', '"cancelled"'::jsonb)
where id = '80000000-0000-0000-0000-000000000003';
select lives_ok(
  $$select request_craft_atomic(
    '10000000-0000-0000-0000-000000000003',
    '50000000-0000-0000-0000-000000000001',
    '80000000-0000-0000-0000-000000000003', 0, 'Try again', 40,
    'test:craft:one'
  )$$,
  'cancelled craft work can be re-requested with a versioned attempt'
);
select is((select count(*)::integer from ledger where idempotency_key like 'test:craft:one%'), 2, 'craft re-request writes one debit per attempt');
select is(
  (select body->'deliverables'->0->'craft'->>'attempt' from outputs where id = '80000000-0000-0000-0000-000000000003'),
  '2',
  'craft re-request advances the attempt number'
);

select * from finish();
rollback;

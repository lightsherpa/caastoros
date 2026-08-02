-- ─────────────────────────────────────────────────────────────
-- §7 Cost economy — real pricing + cost reconciliation.
--
-- Makes docs/apis-and-agents-plan.md §7 real: a `pricing` table so a
-- price change is a row change, an effective-dated lookup so a run is
-- priced at the rate in force when it started, and the `runs` columns
-- to persist reconciled cost. Supersedes the parametric α/β/γ/δ/ε math
-- in CaastorOS_API_Cost_Model.xlsx.
--
-- Operator-facing only: RLS on both reference tables is enabled with NO
-- policy → deny-all for anon/authenticated. The server reads them with
-- the service role (which bypasses RLS). This enforces the standing
-- "credits only, never API cost" rule at the DB boundary — no price ever
-- reaches the browser.
--
-- Additive only. No billing/Stripe changes.
-- ─────────────────────────────────────────────────────────────

-- Rates verified 2026-08-02 (USD per 1M tokens; usd_per_image per image).
-- Keyed by (model_route, effective_from); resolve latest effective_from
-- <= run.started_at. model_route follows router.js conventions exactly
-- (anthropic/<model>, openrouter/<vendor>/<model>, vendor/fal/<model>).
create table pricing (
  id                         uuid primary key default gen_random_uuid(),
  model_route                text not null,
  effective_from             timestamptz not null,
  vendor                     text not null,
  input_usd_per_m            numeric,   -- uncached input tokens
  cache_read_usd_per_m       numeric,   -- cache-hit input tokens
  cache_write_5m_usd_per_m   numeric,   -- 5-minute cache write
  cache_write_1h_usd_per_m   numeric,   -- 1-hour cache write
  output_usd_per_m           numeric,
  usd_per_image              numeric,   -- image models; null for text
  batch_discount             numeric,   -- 0..1 fraction off token cost when batched
  notes                      text,
  created_at                 timestamptz not null default now(),
  unique (model_route, effective_from)
);
create index pricing_route_idx on pricing (model_route, effective_from desc);

-- Single source of truth for USD → credits. credits = ceil(usd / usd_per_credit).
-- usd_per_credit = 0.001 ($0.001 of raw vendor cost per credit): chosen so a
-- typical UNCACHED Sonnet specialist run (~$0.009 raw: ~1.5k in @ $2/M + ~600
-- out @ $10/M) computes to ~9 credits — matching the hand-set `cr` baseline for
-- text specialists, keeping the estimate→computed switch roughly credit-neutral
-- for the dominant text workload. Assembly cache hits (§7, 60-80% input savings)
-- then make 2nd..Nth specialists cost fewer credits, as intended. Images price
-- higher than their old hand-set cr because those were under-costed — the §7
-- correction. Margin is tuned by changing this one row.
create table credit_policy (
  id                uuid primary key default gen_random_uuid(),
  usd_per_credit    numeric not null,
  effective_from    timestamptz not null,
  notes             text,
  created_at        timestamptz not null default now()
);

alter table pricing        enable row level security;
alter table credit_policy  enable row level security;

-- Runs: persist the reconciled cost + audit trail.
alter table runs add column usage           jsonb;   -- full cost-engine usage object
alter table runs add column credits_charged int;      -- computed credits (cr fallback when costing failed)
alter table runs add column pricing_row_id  uuid references pricing(id);
alter table runs add column cost_error       text;     -- non-null flag = costing failed; cost_usd left null
-- Widen cost_usd for sub-cent per-call costs (cache-read-heavy runs are < $0.0001).
alter table runs alter column cost_usd type numeric(14,6);

-- ── Seed: Anthropic (real rates, batch_discount 0.5) ──────────────────
insert into pricing (model_route, effective_from, vendor, input_usd_per_m, cache_read_usd_per_m, cache_write_5m_usd_per_m, cache_write_1h_usd_per_m, output_usd_per_m, batch_discount, notes) values
  ('anthropic/claude-opus-5',              '2026-08-02T00:00:00Z', 'anthropic', 5,   0.5,  6.25, 10,  25,  0.5, 'verified 2026-08-02'),
  ('anthropic/claude-sonnet-5',            '2026-08-02T00:00:00Z', 'anthropic', 2,   0.2,  2.5,  4,   10,  0.5, 'INTRO pricing — ends 2026-08-31; standard row effective 2026-09-01'),
  ('anthropic/claude-sonnet-5',            '2026-09-01T00:00:00Z', 'anthropic', 3,   0.3,  3.75, 6,   15,  0.5, 'standard pricing (post-intro), verified 2026-08-02'),
  ('anthropic/claude-sonnet-4-6',          '2026-08-02T00:00:00Z', 'anthropic', 3,   0.3,  3.75, 6,   15,  0.5, 'verified 2026-08-02'),
  ('anthropic/claude-haiku-4-5-20251001',  '2026-08-02T00:00:00Z', 'anthropic', 1,   0.1,  1.25, 2,   5,   0.5, 'verified 2026-08-02');

-- ── Seed: OpenRouter (RATE MISSING — cannot verify 2026 published rates for
--    these routes; reconciliation uses OpenRouter's live per-call `cost` which
--    already includes the platform fee. Fill token rates when verified). ──────
insert into pricing (model_route, effective_from, vendor, notes) values
  ('openrouter/google/gemini-3.6-flash',      '2026-08-02T00:00:00Z', 'openrouter', 'RATE MISSING — seed from OpenRouter published per-token rates incl. platform fee; verify monthly. Reconciled from vendor cost_usd until filled.'),
  ('openrouter/google/gemini-3.5-flash-lite', '2026-08-02T00:00:00Z', 'openrouter', 'RATE MISSING — seed from OpenRouter published per-token rates incl. platform fee; verify monthly. Reconciled from vendor cost_usd until filled.'),
  ('openrouter/openai/gpt-5',                 '2026-08-02T00:00:00Z', 'openrouter', 'RATE MISSING — seed from OpenRouter published per-token rates incl. platform fee; verify monthly. Reconciled from vendor cost_usd until filled.');

-- ── Seed: fal image routes (usd_per_image from fal published pricing; token
--    columns null. gpt-image-2 is token-priced → RATE MISSING). ──────────────
insert into pricing (model_route, effective_from, vendor, usd_per_image, notes) values
  ('vendor/fal/flux-1.1-pro',  '2026-08-02T00:00:00Z', 'fal', 0.04,  'fal published'),
  ('vendor/fal/flux-schnell',  '2026-08-02T00:00:00Z', 'fal', 0.003, 'fal published'),
  ('vendor/fal/recraft-v3',    '2026-08-02T00:00:00Z', 'fal', 0.03,  'fal published'),
  ('vendor/fal/gpt-image-2',   '2026-08-02T00:00:00Z', 'fal', null,   'RATE MISSING — token-priced model; reconciled from vendor cost_usd until per-image rate is set');

insert into credit_policy (usd_per_credit, effective_from, notes) values
  (0.001, '2026-08-02T00:00:00Z', '1 credit = $0.001 raw vendor cost. Anchored to a typical uncached Sonnet text run (~$0.009 → ~9 cr) to match the hand-set cr baseline. Margin lever: change this row.');

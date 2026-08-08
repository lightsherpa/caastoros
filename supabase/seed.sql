-- ─────────────────────────────────────────────────────────────
-- Seed data — applied automatically after `supabase db reset`
-- (local dev only by default; remote requires explicit `--db-url`).
--
-- Industries (rev-2 §4.4) — 8 V1 slugs, multilingual labels for
-- EN/ES/IT markets La Mesa serves. Industry list is editable from
-- the admin route in P9; this seed is the day-1 floor.
-- ─────────────────────────────────────────────────────────────
insert into industries (slug, label_en, label_es, label_it, display_order) values
  ('ecommerce_dtc',         'E-commerce / DTC',          'E-commerce / DTC',          'E-commerce / DTC',          1),
  ('saas_software',         'SaaS / Software',           'SaaS / Software',           'SaaS / Software',           2),
  ('hospitality_fnb',       'Hospitality / F&B',         'Hostelería / F&B',          'Ospitalità / F&B',          3),
  ('creative_agency',       'Creative / Agency',         'Creativo / Agencia',        'Creativo / Agenzia',        4),
  ('professional_services', 'B2B Professional Services', 'Servicios profesionales',   'Servizi professionali',     5),
  ('consumer_brand',        'Consumer Brand',            'Marca de consumo',          'Marca di consumo',          6),
  ('education',             'Education',                 'Educación',                 'Istruzione',                7),
  ('health_wellness',       'Health & Wellness',         'Salud y bienestar',         'Salute e benessere',        8);

-- Templates: per rev-2 §12 sequencing, templates 2+5 land at P4,
-- template 1 at P5, templates 3+4 at P6. NO seed rows yet — they'll
-- be inserted at their respective phases so we don't ship a draft
-- table with stale data the engineer has to wipe.

-- ─────────────────────────────────────────────────────────────
-- Brand Stewards (tier-2 certification bench) — REQUIRED before
-- REQUIRE_HUMAN_CERT=1 (CAA-25). Without at least one active steward
-- linked to a real login, assign-steward.js leaves every cert job
-- unassigned → no BIO ever gets certified_by set → every specialist
-- run 409s "awaiting Brand Steward certification". See the runbook:
-- docs/tier2-enforcement-runbook.md.
--
-- NOT seeded here on purpose: a Steward is a real person with a login,
-- not fixture data — shipping a fake steward to prod would create a
-- "certifier" who cannot actually review. Seed real people per-env by
-- filling the template below with actual users.id values, e.g.:
--
--   insert into team_members (user_id, name, first_name, roles, active) values
--     ('<real-users.id>', 'Dana Ruiz',  'Dana',  '{steward}',                 true),
--     ('<real-users.id>', 'Sam Okafor', 'Sam',   '{steward,lead_steward}',    true);
--
-- lead_steward is what lets calibration finalize (STEWARD_CALIBRATION_REQUIRED).

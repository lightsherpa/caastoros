-- ─────────────────────────────────────────────────────────────────────
-- M5 · Language / locale foundation
--
-- Spec §4: language-of-brief and language-of-output are SEPARATE. A brand
-- briefed in Spanish must be able to produce Arabic output. This migration
-- adds the columns that let callers thread locale correctly through the
-- brand → bio → brief → run → output chain.
--
-- Supported locales: 'en', 'es', 'ar'. Numeral systems: 'latn' (0-9),
-- 'arab' (٠-٩) — a brand may write Arabic prose with Western digits, so
-- the numeral system is tracked independently of the language.
--
-- Additive & safe: every column is added `if not exists` with a NOT NULL
-- default or a nullable default, so no existing row loses data and no
-- backfill is required. RLS is unchanged — the init-migration workspace
-- isolation policies already cover every table touched here.
-- ─────────────────────────────────────────────────────────────────────

-- ── brands ───────────────────────────────────────────────────────────
-- Brand-level language defaults. `default_locale` is the brand's home
-- language; `output_locales` is the set of languages it ships in (the
-- run/brief fallback when a request doesn't pin its own targets);
-- `numeral_system` picks the digit shaping used in rendered output.
alter table brands
  add column if not exists default_locale text not null default 'en'
    check (default_locale in ('en','es','ar'));
alter table brands
  add column if not exists output_locales text[] not null default '{en}';
alter table brands
  add column if not exists numeral_system text not null default 'latn'
    check (numeral_system in ('latn','arab'));

comment on column brands.default_locale is
  'Brand home language (en|es|ar). Fallback for output when nothing more specific is pinned.';
comment on column brands.output_locales is
  'Languages this brand ships output in. Default {en}. Never assumed equal to a brief''s language.';
comment on column brands.numeral_system is
  'Digit shaping for rendered output: latn (0-9) or arab (٠-٩). Independent of language.';

-- ── bios ─────────────────────────────────────────────────────────────
-- Which languages a BIO's voice has been certified in. A market-fluent
-- human certifies a language's voice; empty {} means no language is yet
-- human-certified for this BIO version.
alter table bios
  add column if not exists cert_locales text[] not null default '{}';

comment on column bios.cert_locales is
  'Languages whose voice a market-fluent human has certified for this BIO version. Empty {} = none.';

-- ── briefs ───────────────────────────────────────────────────────────
-- `brief_lang` is the language the brief was WRITTEN in; `output_locales`
-- is the set of TARGET languages for the work. They are deliberately
-- separate columns — output targets are never assumed equal to brief_lang.
alter table briefs
  add column if not exists brief_lang text default 'en'
    check (brief_lang in ('en','es','ar'));
alter table briefs
  add column if not exists output_locales text[];

comment on column briefs.brief_lang is
  'Language the brief was written in (en|es|ar). Input language only — not the output target.';
comment on column briefs.output_locales is
  'Target output languages for this brief. Distinct from brief_lang; null falls back to the brand.';

-- ── runs ─────────────────────────────────────────────────────────────
-- The output language pinned at run time, alongside spec_version /
-- bio_version, so a run reproduces forever in the same language.
alter table runs
  add column if not exists output_locale text default 'en'
    check (output_locale in ('en','es','ar'));

comment on column runs.output_locale is
  'Output language pinned for this run (en|es|ar). Pinned for reproducibility, like spec_version/bio_version.';

-- ── outputs ──────────────────────────────────────────────────────────
-- One output row per locale — a run targeting two languages produces two
-- output rows, each stamped with its own locale.
alter table outputs
  add column if not exists locale text default 'en'
    check (locale in ('en','es','ar'));

comment on column outputs.locale is
  'Language of this output row (en|es|ar). One output row per locale.';

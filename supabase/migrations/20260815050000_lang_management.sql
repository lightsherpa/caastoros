-- ─────────────────────────────────────────────────────────────────────
-- Language management — profile language + governance + translation overrides
--
-- Three additions, all additive:
--   1. users.locale            — the user's platform language (the profile
--                                setting; applied on login, follows the user
--                                across devices instead of localStorage-only).
--   2. workspaces.enabled_locales / default_locale
--                              — governance: which languages a workspace
--                                offers, and the default a new member gets.
--   3. translations            — DB-backed overrides the admin coverage/QA
--                                manager edits live. The client merges these
--                                over the static JSON catalogs at boot, so a
--                                missing/incorrect string can be fixed without
--                                a redeploy. `en` stays the source of truth
--                                for the KEY SET (defined in en.json); this
--                                table only supplies/overrides VALUES.
--
-- Supported locales stay 'en' | 'es' | 'ar' (matches src/lib/i18n.js).
-- ─────────────────────────────────────────────────────────────────────

-- 1) Per-user platform language.
alter table users
  add column if not exists locale text not null default 'en'
    check (locale in ('en', 'es', 'ar'));

-- 2) Per-workspace language governance.
alter table workspaces
  add column if not exists enabled_locales text[] not null default '{en,es,ar}';
alter table workspaces
  add column if not exists default_locale text not null default 'en'
    check (default_locale in ('en', 'es', 'ar'));

-- 3) Translation overrides. Global (not tenant-scoped) — the platform UI is
-- one shared surface. Keys are the same dotted keys used by t() ("nav.create").
create table if not exists translations (
  id         uuid primary key default gen_random_uuid(),
  locale     text not null check (locale in ('en', 'es', 'ar')),
  key        text not null,
  value      text not null,
  updated_by uuid references users(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (locale, key)
);

-- Server-only: the client reads overrides through GET /api/i18n/translations
-- (service role), never the table directly. RLS on with no policy => client
-- role is denied; supabaseAdmin (service role) bypasses RLS. Consistent with
-- the M1 write-lockdown posture.
alter table translations enable row level security;
revoke insert, update, delete on translations from anon, authenticated;

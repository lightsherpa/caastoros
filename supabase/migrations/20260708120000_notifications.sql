-- ─────────────────────────────────────────────────────────────────────
-- Notifications + per-user channel preferences
--   notifications      — per-recipient inbox (user_id = auth.uid())
--   notification_prefs — per-user channel on/off (in-app, email)
-- Delivery is server-written (service role); clients read their own rows,
-- and Supabase Realtime pushes new rows to the recipient (RLS-scoped).
-- ─────────────────────────────────────────────────────────────────────

create table if not exists notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  kind        text not null,                 -- craft.queued | craft.delivered | steward.assigned | steward.certified | run.complete
  title       text not null,
  body        text,
  link        text,                          -- in-app hash route to open, e.g. '#/canvas'
  brand_id    uuid references brands(id) on delete cascade,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists notifications_user_unread_idx
  on notifications (user_id, created_at desc) where read_at is null;
create index if not exists notifications_user_created_idx
  on notifications (user_id, created_at desc);   -- serves the full inbox list query

-- RLS is MANDATORY: the grants migration auto-grants ALL to authenticated, so
-- an un-RLS'd table would be world-readable. Recipient self-read + self-update
-- (mark read); inserts are service-role only (the notify() dispatcher).
alter table notifications enable row level security;
create policy notifications_self_read   on notifications for select using (user_id = auth.uid());
create policy notifications_self_update on notifications for update using (user_id = auth.uid());
-- Column-scoped: a recipient may only flip read_at, not rewrite title/body/link.
-- (The server marks-read via service role, which bypasses this.)
revoke update on notifications from anon, authenticated;
grant  update (read_at) on notifications to authenticated;

create table if not exists notification_prefs (
  user_id     uuid primary key references users(id) on delete cascade,
  in_app      boolean not null default true,
  email       boolean not null default true,
  updated_at  timestamptz not null default now()
);
alter table notification_prefs enable row level security;
create policy notification_prefs_self_read   on notification_prefs for select using (user_id = auth.uid());
create policy notification_prefs_self_write  on notification_prefs for insert with check (user_id = auth.uid());
create policy notification_prefs_self_update on notification_prefs for update using (user_id = auth.uid());

-- Realtime: broadcast INSERTs on notifications so the recipient's browser gets
-- an instant push. RLS above governs which rows each client actually receives.
-- Guarded so re-runs / non-hosted DBs (no supabase_realtime publication) don't error.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
     )
  then
    alter publication supabase_realtime add table notifications;
  end if;
end $$;

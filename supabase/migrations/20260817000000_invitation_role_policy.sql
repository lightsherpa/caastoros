-- Super Admin and Admin may invite every account role. Creative Directors
-- may invite Designers only; Workspace Admins may invite workspace Members only.
alter table public.access_invitations
  drop constraint if exists access_invitations_platform_role_check;
alter table public.access_invitations
  add constraint access_invitations_platform_role_check
  check (platform_role in ('super_admin','platform_admin','creative_director','designer'));

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
    legacy_role := case invite.platform_role when 'super_admin' then 'super_admin' when 'platform_admin' then 'admin' else 'team' end;
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

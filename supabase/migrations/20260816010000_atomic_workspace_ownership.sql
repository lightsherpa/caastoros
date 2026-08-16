-- Make workspace ownership transfer a single locked database transaction.
-- The function is callable only by the service role; API authorization, MFA,
-- reason capture, and audit logging remain in the application route.

create or replace function public.transfer_workspace_ownership(
  p_workspace_id uuid,
  p_new_owner_id uuid
)
returns public.workspace_memberships
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner public.workspace_memberships;
begin
  -- Serialize transfers for the same workspace, including the target row.
  perform 1
    from public.workspace_memberships
   where workspace_id = p_workspace_id
   for update;

  if not exists (
    select 1
      from public.workspace_memberships
     where workspace_id = p_workspace_id
       and user_id = p_new_owner_id
  ) then
    raise exception 'New owner must already be a workspace member'
      using errcode = 'P0002';
  end if;

  update public.workspace_memberships
     set is_owner = false,
         updated_at = now()
   where workspace_id = p_workspace_id
     and is_owner = true
     and user_id <> p_new_owner_id;

  update public.workspace_memberships
     set is_owner = true,
         role = 'workspace_admin',
         status = 'active',
         updated_at = now()
   where workspace_id = p_workspace_id
     and user_id = p_new_owner_id
  returning * into v_owner;

  return v_owner;
end;
$$;

revoke all on function public.transfer_workspace_ownership(uuid, uuid) from public, anon, authenticated;
grant execute on function public.transfer_workspace_ownership(uuid, uuid) to service_role;

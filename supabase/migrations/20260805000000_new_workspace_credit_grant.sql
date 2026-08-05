-- ─────────────────────────────────────────────────────────────
-- New workspaces get a starting credit grant.
--
-- Bug: handle_new_auth_user() created the workspace, users row and
-- default brand but never wrote a ledger row. creditBalanceFromRows
-- sums the ledger and negates it, so a fresh workspace started at 0
-- and went NEGATIVE on the first run (observed live: -36 after three
-- 12-credit debits).
--
-- Sign convention (ledger.credits): positive = debit, negative = credit.
-- The grant is therefore a NEGATIVE credits value.
--
-- Amount = 300 = MONTHLY_POOL["00"] in server/src/lib/plan-limits.js
-- (The Creek). Not a smaller trial number, because assertCreditsAvailable
-- already caps monthly debits at monthlyPool(tier) = 300 for tier '00':
-- anything larger is unspendable, anything smaller would show the user a
-- balance that contradicts the pool their tier advertises. Keep in sync
-- with MONTHLY_POOL["00"] if pricing changes.
--
-- kind = 'monthly_pool' — the kind already documented on the ledger table
-- for a pool entitlement, so when a monthly refill job eventually exists
-- (none does today) the first month's grant reads identically to later ones.
--
-- Idempotent: create or replace, no data migration. The existing
-- on_auth_user_created trigger already points at this function, so it is
-- not recreated. Existing workspaces are handled by
-- scripts/backfill-credit-grant.mjs.
-- ─────────────────────────────────────────────────────────────

create or replace function handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  new_workspace_id uuid;
  new_brand_id uuid;
  starting_credits int := 300;  -- MONTHLY_POOL tier 00
begin
  -- Create a default workspace named from the email's local part
  insert into workspaces (name, tier)
    values (split_part(new.email, '@', 1) || '''s workspace', '00')
    returning id into new_workspace_id;

  -- Create the users row linking auth.users → workspace
  insert into users (id, workspace_id, email, role)
    values (new.id, new_workspace_id, new.email, 'client');

  -- Seed a default brand so first /home and /bio render against real rows
  insert into brands (workspace_id, name)
    values (new_workspace_id, 'My brand')
    returning id into new_brand_id;

  -- Starting credit grant (negative credits = credit, see above)
  insert into ledger (workspace_id, credits, kind, balance_after)
    values (new_workspace_id, -starting_credits, 'monthly_pool', starting_credits);

  return new;
end;
$fn$;

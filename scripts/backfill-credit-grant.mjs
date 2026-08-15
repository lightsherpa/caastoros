// ─────────────────────────────────────────────────────────────────────
// One-shot backfill: starting credit grant for workspaces created before
// the signup trigger wrote one.
//
// handle_new_auth_user() used to create workspace + user + default brand
// and no ledger row, so a workspace's ledger held only debits and the home
// dashboard rendered a NEGATIVE balance. The migration
// 20260805000000_new_workspace_credit_grant.sql fixes new signups; this
// catches the workspaces that already exist.
//
// Sign convention (ledger.credits): positive = debit, negative = credit.
// A grant is a NEGATIVE credits value.
//
// Amount = monthlyPool(tier) — the tier's own pool, so a workspace that
// paid up gets what it paid for. Tier '03' (The Colony) has pool 0 =
// unlimited monthly cap, which is not an amount: those are skipped and
// reported for a manual `npm run grant:pilot-credits`.
//
// Never double-grants: any existing credit row (credits < 0, i.e. a prior
// pool grant OR a pilot topup) means the workspace is already funded.
//
// Run:  npm run backfill:credit-grant       (add DRY=1 to preview)
// ─────────────────────────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";
import { monthlyPool } from "../server/src/lib/plan-limits.js";

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing (run via npm script so --env-file applies)");
  process.exit(1);
}
const dryRun = process.env.DRY === "1";
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: workspaces, error: wsErr } = await sb.from("workspaces").select("id, name, tier");
if (wsErr) { console.error("workspaces query failed:", wsErr.message); process.exit(1); }

let granted = 0, skipped = 0;
for (const ws of workspaces || []) {
  const { data: rows, error: ledgerErr } = await sb
    .from("ledger")
    .select("credits")
    .eq("workspace_id", ws.id)
    .limit(50000);
  if (ledgerErr) { console.error(`! ${ws.name}: ledger read failed — ${ledgerErr.message}`); continue; }

  if ((rows || []).some((row) => Number(row.credits) < 0)) {
    console.log(`— ${ws.name}: already has a credit grant`);
    skipped++;
    continue;
  }

  const amount = monthlyPool(ws.tier || "00");
  if (!amount) {
    console.log(`— ${ws.name}: tier ${ws.tier} is unlimited (no pool amount) — grant manually`);
    skipped++;
    continue;
  }

  const balance = -(rows || []).reduce((sum, row) => sum + (Number(row.credits) || 0), 0);
  const newBalance = balance + amount;

  if (dryRun) {
    console.log(`~ ${ws.name}: would grant ${amount} (tier ${ws.tier}) — balance ${balance} -> ${newBalance}`);
    granted++;
    continue;
  }

  const { error } = await sb.from("ledger").insert({
    workspace_id: ws.id,
    credits: -amount,
    kind: "monthly_pool",
    balance_after: newBalance,
  });
  if (error) { console.error(`! ${ws.name}: ${error.message}`); continue; }
  console.log(`✓ ${ws.name}: granted ${amount} (tier ${ws.tier}) — balance ${balance} -> ${newBalance}`);
  granted++;
}

console.log(`\n${dryRun ? "[dry run] " : ""}${granted} granted, ${skipped} skipped.`);

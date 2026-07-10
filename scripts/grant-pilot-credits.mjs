// Grant pilot credits to an existing workspace.
//
// Usage:
//   EMAIL=client@example.com CREDITS=900 npm run grant:pilot-credits
//   WORKSPACE_ID=<uuid> CREDITS=900 npm run grant:pilot-credits

import { createClient } from "@supabase/supabase-js";

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
const email = process.env.EMAIL?.trim();
let workspaceId = process.env.WORKSPACE_ID?.trim();
const amount = Number(process.env.CREDITS || 900);

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in env");
  process.exit(1);
}
if (!email && !workspaceId) {
  console.error("Usage: EMAIL=client@example.com [CREDITS=900] npm run grant:pilot-credits");
  console.error("   or: WORKSPACE_ID=<uuid> [CREDITS=900] npm run grant:pilot-credits");
  process.exit(1);
}
if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(amount)) {
  console.error("CREDITS must be a positive integer");
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

if (!workspaceId) {
  const { data: user, error } = await sb
    .from("users")
    .select("workspace_id, email")
    .ilike("email", email)
    .maybeSingle();
  if (error) {
    console.error("User lookup failed:", error.message);
    process.exit(1);
  }
  if (!user?.workspace_id) {
    console.error(`No workspace found for ${email}`);
    process.exit(1);
  }
  workspaceId = user.workspace_id;
  console.log(`Found workspace for ${user.email}: ${workspaceId}`);
}

const { data: rows, error: ledgerErr } = await sb
  .from("ledger")
  .select("credits")
  .eq("workspace_id", workspaceId);
if (ledgerErr) {
  console.error("Ledger read failed:", ledgerErr.message);
  process.exit(1);
}

const currentBalance = -(rows || []).reduce((sum, row) => sum + (Number(row.credits) || 0), 0);
const newBalance = currentBalance + amount;

const { error: insertErr } = await sb.from("ledger").insert({
  workspace_id: workspaceId,
  credits: -amount,
  kind: "topup",
  balance_after: newBalance,
});
if (insertErr) {
  console.error("Credit grant failed:", insertErr.message);
  process.exit(1);
}

console.log(`Granted ${amount} pilot credits.`);
console.log(`Workspace: ${workspaceId}`);
console.log(`Balance:   ${currentBalance} -> ${newBalance}`);

// ─────────────────────────────────────────────────────────────────────
// Create (or reset) a CLIENT-role test account for clicking through the
// client portal.
//
// The usual dev account (oscar+25may) has users.role='team' plus steward
// roles, so it lands in the team portal and can't exercise client
// surfaces at all. This makes a plain client, which is also the only way
// to exercise the cross-tenant guard on /api/team/overview — a team
// member always gets 200 there, so the deny path never runs.
//
// The signup trigger does the real work (workspace + brand + 300cr).
// On top of that this adds a second brand, so brand delete isn't
// disabled by the last-brand guard, and seeds ONE small fixture brief +
// run + output + ledger debit so the per-brand stats show a non-zero
// row next to a zero row. The fixture rows are labelled as such — they
// are not model output and no API was called to make them.
//
// Run:    npm run make:test-client
// Reset:  RESET=1 npm run make:test-client      (deletes, then recreates)
// Remove: DELETE=1 npm run make:test-client
// ─────────────────────────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";

const EMAIL    = process.env.TEST_EMAIL || "client-test@caastor-test.invalid";
const PASSWORD = process.env.TEST_PASSWORD || "CaastorClient2026!";

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (run via npm so --env-file applies)");
  process.exit(1);
}
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function findUser() {
  const { data } = await sb.auth.admin.listUsers({ perPage: 1000 });
  return data.users.find((u) => u.email?.toLowerCase() === EMAIL.toLowerCase()) || null;
}

async function removeExisting() {
  const existing = await findUser();
  if (!existing) return false;
  const { data: row } = await sb.from("users").select("workspace_id").eq("id", existing.id).maybeSingle();
  if (row?.workspace_id) await sb.from("workspaces").delete().eq("id", row.workspace_id);  // cascades everything
  await sb.auth.admin.deleteUser(existing.id);
  return true;
}

if (process.env.DELETE === "1" || process.env.RESET === "1") {
  const gone = await removeExisting();
  console.log(gone ? `Removed ${EMAIL} and its workspace.` : `No existing ${EMAIL} to remove.`);
  if (process.env.DELETE === "1") process.exit(0);
}

if (await findUser()) {
  console.error(`${EMAIL} already exists. Use RESET=1 to recreate it, or DELETE=1 to remove it.`);
  process.exit(1);
}

// 1. Signup — the trigger creates workspace + users row + 'My brand' + 300cr
const { data: created, error: cErr } = await sb.auth.admin.createUser({
  email: EMAIL, password: PASSWORD, email_confirm: true,
});
if (cErr) { console.error("createUser failed:", cErr.message); process.exit(1); }
await new Promise((r) => setTimeout(r, 1200));

const { data: me } = await sb.from("users").select("workspace_id, role").eq("id", created.user.id).single();
const wsId = me.workspace_id;
const { data: ws } = await sb.from("workspaces").select("name, tier").eq("id", wsId).single();

// 2. Second brand, so the last-brand delete guard isn't the only state visible
const { data: brand2 } = await sb.from("brands")
  .insert({ workspace_id: wsId, name: "Second Brand", url: "https://example.com" })
  .select("id, name").single();
const { data: brand1 } = await sb.from("brands")
  .select("id, name").eq("workspace_id", wsId).order("created_at").limit(1).single();

// 3. One fixture brief on brand1 so per-brand stats have a non-zero row.
//    brand2 stays at zero so both states are visible side by side.
const { data: brief } = await sb.from("briefs").insert({
  brand_id: brand1.id,
  title: "Fixture brief for UI testing",
  type: "one_off",
  payload: { request: "Seeded by scripts/make-test-client.mjs — not model output.", title: "Fixture brief for UI testing" },
  mode: "auto", status: "active",
}).select("id").single();

const { data: run } = await sb.from("runs").insert({
  brief_id: brief.id, specialist_id: "a14", spec_version: 1, bio_version: 1,
  status: "completed", latency_ms: 1240,
  started_at: new Date(Date.now() - 1240).toISOString(), ended_at: new Date().toISOString(),
}).select("id").single();

await sb.from("outputs").insert({
  run_id: run.id, brief_id: brief.id, kind: "copy",
  body: { text: "Seeded fixture output — not produced by a specialist." },
  status: "approved",
});

await sb.from("ledger").insert({ workspace_id: wsId, run_id: run.id, credits: 2, kind: "run", balance_after: 298 });

const { data: ledger } = await sb.from("ledger").select("credits").eq("workspace_id", wsId);
const balance = -(ledger || []).reduce((s, r) => s + Number(r.credits || 0), 0);

console.log(`
  Client test account ready
  ─────────────────────────────────────────────
  email      ${EMAIL}
  password   ${PASSWORD}
  role       ${me.role}          ← client, so it lands in the client portal
  workspace  ${ws.name} · tier ${ws.tier}
  balance    ${balance} cr       (300 granted by the signup trigger, 2 spent)

  Brands
    ${brand1.name.padEnd(14)} 1 brief · 2 cr    ← fixture data
    ${brand2.name.padEnd(14)} 0 briefs · 0 cr   ← untouched, shows the zero state

  Reset:  RESET=1 npm run make:test-client
  Remove: DELETE=1 npm run make:test-client
`);

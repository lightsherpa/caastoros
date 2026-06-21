// ─────────────────────────────────────────────────────────────────────
// Grant Steward role to an existing user. One-shot helper for dev.
//
// Run:  EMAIL=you@example.com npm run grant:steward
//
// What it does:
//   1. Looks up the auth.users row by email
//   2. Updates public.users.role to 'team'
//   3. Inserts/updates a team_members row with roles=['steward','lead_steward']
//
// Why 'lead_steward' too: in dev you'll often be the only Steward,
// so giving Lead too lets you exercise the calibration review path
// (which needs at minimum one Lead reviewer).
// ─────────────────────────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";

const email = process.env.EMAIL;
if (!email) {
  console.error("Usage: EMAIL=you@example.com npm run grant:steward");
  process.exit(1);
}

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// 1) Find auth user by email (admin API; service-role required)
const { data: list, error: listErr } = await sb.auth.admin.listUsers();
if (listErr) { console.error("listUsers failed:", listErr.message); process.exit(1); }
const authUser = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
if (!authUser) { console.error(`No auth user with email ${email}`); process.exit(1); }
console.log(`Found auth user: ${authUser.email} (${authUser.id})`);

// 2) Flip public.users.role → 'team'
const { error: updErr } = await sb
  .from("users")
  .update({ role: "team" })
  .eq("id", authUser.id);
if (updErr) { console.error("users role update failed:", updErr.message); process.exit(1); }
console.log(`✓ users.role = 'team'`);

// 3) Upsert team_members row
const firstName = authUser.email.split("@")[0].split(/[.+_-]/)[0] || "Steward";
const fullName = firstName.charAt(0).toUpperCase() + firstName.slice(1);

const { data: existing } = await sb
  .from("team_members")
  .select("id, roles")
  .eq("user_id", authUser.id)
  .maybeSingle();

if (existing) {
  const merged = Array.from(new Set([...(existing.roles || []), "steward", "lead_steward"]));
  const { error } = await sb.from("team_members").update({ roles: merged, active: true }).eq("id", existing.id);
  if (error) { console.error("team_members update failed:", error.message); process.exit(1); }
  console.log(`✓ team_members updated (roles now: ${merged.join(", ")})`);
} else {
  const { error } = await sb.from("team_members").insert({
    user_id: authUser.id,
    name: fullName,
    first_name: fullName,
    roles: ["steward", "lead_steward"],
    active: true,
  });
  if (error) { console.error("team_members insert failed:", error.message); process.exit(1); }
  console.log(`✓ team_members row created (name=${fullName}, roles=[steward, lead_steward])`);
}

console.log(`\nDone. Sign out + sign in to refresh the SPA session, then GET /api/steward/jobs should return jobs (and a queued one should already exist from your earlier Discovery run).`);

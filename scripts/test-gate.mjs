// Acceptance harness for the M1 certification gate + RLS write-lockdown.
//
// These assertions require the M1 migration (20260815000000) to be APPLIED
// and a real logged-in user's access token. They prove, from the client's
// own anon key + JWT, that the forge surface is closed.
//
// Run:
//   SUPABASE_URL=... SUPABASE_ANON_KEY=... TEST_JWT=<access_token> \
//     node scripts/test-gate.mjs
// (TEST_JWT = a signed-in client's access_token — copy from the SPA session,
//  or mint one with the service role.)
//
// Every attack below MUST fail. If one SUCCEEDS, the vulnerability is live —
// the script reports FAIL and reverts any change it managed to make.

import { createClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const JWT = process.env.TEST_JWT;
if (!URL || !ANON || !JWT) {
  console.error("Set SUPABASE_URL, SUPABASE_ANON_KEY, TEST_JWT.");
  process.exit(2);
}

const sb = createClient(URL, ANON, { global: { headers: { Authorization: `Bearer ${JWT}` } } });
let failures = 0;
const check = (name, passed, detail = "") => {
  console.log(`${passed ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  if (!passed) failures++;
};

// The client can READ its own bio (RLS select stays).
const { data: bio, error: readErr } = await sb
  .from("bios").select("id, certified, self_certified").order("version", { ascending: false }).limit(1).maybeSingle();
check("client can read its own BIO (select preserved)", !readErr && !!bio, readErr?.message || (bio ? `bio ${bio.id}` : "no bio"));

if (bio) {
  // Attack 1 — forge human certification directly via REST.
  const wasCertified = bio.certified;
  await sb.from("bios").update({ certified: true, cert_kind: "onboarding" }).eq("id", bio.id);
  const { data: after1 } = await sb.from("bios").select("certified").eq("id", bio.id).maybeSingle();
  const forged1 = after1?.certified === true && wasCertified !== true;
  check("cannot forge bios.certified=true via REST", !forged1);
  if (forged1) await sb.from("bios").update({ certified: wasCertified }).eq("id", bio.id); // best-effort revert
}

// Attack 2 — forge credits by inserting a positive ledger row.
const { data: ws } = await sb.from("workspaces").select("id").limit(1).maybeSingle();
if (ws) {
  const { data: inserted, error: insErr } = await sb
    .from("ledger").insert({ workspace_id: ws.id, credits: -100000, kind: "forge" }).select("id").maybeSingle();
  const forged2 = !insErr && !!inserted?.id;
  check("cannot insert a ledger row via REST (credit forgery)", !forged2, insErr?.message || "");
  if (forged2) await sb.from("ledger").delete().eq("id", inserted.id); // best-effort cleanup
}

// Attack 3 — complete a steward job directly (skip calibration).
const { data: sj } = await sb.from("steward_jobs").select("id, status").limit(1).maybeSingle();
if (sj) {
  await sb.from("steward_jobs").update({ status: "completed" }).eq("id", sj.id);
  const { data: after3 } = await sb.from("steward_jobs").select("status").eq("id", sj.id).maybeSingle();
  check("cannot complete a steward_job via REST", !(after3?.status === "completed" && sj.status !== "completed"));
}

console.log(failures === 0 ? "\nAll gate/RLS assertions passed." : `\n${failures} assertion(s) FAILED — a forge surface is open.`);
process.exit(failures === 0 ? 0 : 1);

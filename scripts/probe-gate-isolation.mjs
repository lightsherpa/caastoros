// ─────────────────────────────────────────────────────────────────────
// Phase-3 adversarial probe — certification GATE, tenant ISOLATION,
// reviewer AUTHORIZATION.
//
// Companion to scripts/test-gate.mjs. Where test-gate.mjs proves the three
// headline forge attacks fail, this harness widens the surface: it attacks
// every server-authoritative write path a client can reach with the anon key
// + its own JWT (PostgREST), the new M2/M3 tables, tenant read-isolation, and
// (optionally, when API_BASE is set) the HTTP gate + delegation token scope.
//
// EVERY attack below MUST fail (be blocked). A PASS means the attack was
// correctly rejected. A FAIL means a live vulnerability. Anything the probe
// cannot attempt with the credentials it has SKIPs with a clear note rather
// than failing.
//
// The probe is READ-MOSTLY: every write it attempts is expected to be denied,
// so nothing should be created. As defence in depth it still tracks any row
// that unexpectedly lands (i.e. a real vuln) and reverts/deletes it in the
// cleanup phase so the probe never leaves state behind.
//
// Run:
//   SUPABASE_URL=... SUPABASE_ANON_KEY=... [TEST_JWT=<client access_token>] \
//   [API_BASE=http://localhost:8787] [TEST_UNCERTIFIED_BRAND_ID=<uuid>] \
//     node scripts/probe-gate-isolation.mjs
//
//   • TEST_JWT — a signed-in CLIENT's access_token (copy from an SPA session,
//     or mint with the service role). Without it, RLS-read-dependent attacks
//     and role-escalation attacks SKIP; the anon-only lockdown attacks (new
//     tables) still run.
//   • API_BASE — base URL of the Hono API. Enables the HTTP gate-bypass and
//     delegation-token-scope probes. Skipped when unset.
//   • TEST_UNCERTIFIED_BRAND_ID — a brand in the JWT's workspace whose BIO is
//     NOT human-certified, for the /api/runs/stream gate probe.
// ─────────────────────────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const URL  = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const JWT  = process.env.TEST_JWT || null;
const API_BASE = (process.env.API_BASE || "").replace(/\/$/, "") || null;
const UNCERTIFIED_BRAND_ID = process.env.TEST_UNCERTIFIED_BRAND_ID || null;

if (!URL || !ANON) {
  console.error("Set SUPABASE_URL and SUPABASE_ANON_KEY (TEST_JWT / API_BASE optional).");
  process.exit(2);
}

const sb = createClient(URL, ANON, JWT ? { global: { headers: { Authorization: `Bearer ${JWT}` } } } : undefined);

let failures = 0;
let skips = 0;
const check = (name, passed, detail = "") => {
  console.log(`${passed ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  if (!passed) failures++;
};
const skip = (name, why) => {
  console.log(`SKIP  ${name}  — ${why}`);
  skips++;
};

// Rows that must never have been created. If any attack unexpectedly SUCCEEDS
// (a live vuln), we record the created/updated row here and undo it in cleanup.
const toDelete = [];   // { table, id }
const toRevert = [];   // async fn

console.log(`\n=== Phase-3 gate / isolation / authz probe ===`);
console.log(`target ${URL}  ·  JWT ${JWT ? "present" : "absent"}  ·  API_BASE ${API_BASE || "unset"}\n`);

// ─────────────────────────────────────────────────────────────────────
// SECTION 1 — Forge via REST (write-lockdown on server-authoritative tables)
// ─────────────────────────────────────────────────────────────────────
console.log("── 1. Forge via REST ──────────────────────────────────────");

// 1a/1b/1c — targeted forge on an existing OWN bio (needs JWT to read it).
if (JWT) {
  const { data: bio, error: readErr } = await sb
    .from("bios").select("id, certified, self_certified")
    .order("version", { ascending: false }).limit(1).maybeSingle();
  check("client can READ its own BIO (RLS select preserved)", !readErr && !!bio, readErr?.message || (bio ? `bio ${bio.id}` : "no bio in workspace"));

  if (bio) {
    // 1a — forge human certification.
    await sb.from("bios").update({ certified: true, cert_kind: "onboarding" }).eq("id", bio.id);
    const { data: a1 } = await sb.from("bios").select("certified").eq("id", bio.id).maybeSingle();
    const forgedCert = a1?.certified === true && bio.certified !== true;
    check("cannot forge bios.certified=true via REST", !forgedCert);
    if (forgedCert) toRevert.push(() => sb.from("bios").update({ certified: bio.certified }).eq("id", bio.id));

    // 1b — forge stage-1 self-cert (unlocks briefing without attestation).
    await sb.from("bios").update({ self_certified: true }).eq("id", bio.id);
    const { data: a2 } = await sb.from("bios").select("self_certified").eq("id", bio.id).maybeSingle();
    const forgedSelf = a2?.self_certified === true && bio.self_certified !== true;
    check("cannot forge bios.self_certified=true via REST", !forgedSelf);
    if (forgedSelf) toRevert.push(() => sb.from("bios").update({ self_certified: bio.self_certified }).eq("id", bio.id));
  }

  // 1c — forge a brand-new already-certified BIO row.
  const { data: brand } = await sb.from("brands").select("id, workspace_id").limit(1).maybeSingle();
  if (brand) {
    const { data: ins, error: insErr } = await sb.from("bios")
      .insert({ brand_id: brand.id, version: 999999, payload: { forged: true }, certified: true })
      .select("id").maybeSingle();
    const forged = !insErr && !!ins?.id;
    check("cannot INSERT a certified bios row via REST", !forged, insErr?.message || "");
    if (forged) toDelete.push({ table: "bios", id: ins.id });
  } else {
    skip("cannot INSERT a certified bios row via REST", "no brand readable in workspace");
  }

  // 1d — forge credits by inserting a ledger row (needs own workspace id).
  const { data: ws } = await sb.from("workspaces").select("id").limit(1).maybeSingle();
  if (ws) {
    const { data: ins, error: insErr } = await sb
      .from("ledger").insert({ workspace_id: ws.id, credits: -100000, kind: "forge" }).select("id").maybeSingle();
    const forged = !insErr && !!ins?.id;
    check("cannot INSERT a ledger row via REST (credit forgery)", !forged, insErr?.message || "");
    if (forged) toDelete.push({ table: "ledger", id: ins.id });
  } else {
    skip("cannot INSERT a ledger row via REST (credit forgery)", "no workspace readable");
  }

  // 1e — complete a steward job directly (skip calibration / four-eyes).
  const { data: sj } = await sb.from("steward_jobs").select("id, status").limit(1).maybeSingle();
  if (sj) {
    await sb.from("steward_jobs").update({ status: "completed", decision: "approve" }).eq("id", sj.id);
    const { data: a } = await sb.from("steward_jobs").select("status").eq("id", sj.id).maybeSingle();
    const forged = a?.status === "completed" && sj.status !== "completed";
    check("cannot complete a steward_job via REST", !forged);
    if (forged) toRevert.push(() => sb.from("steward_jobs").update({ status: sj.status }).eq("id", sj.id));
  } else {
    skip("cannot complete a steward_job via REST", "no steward_jobs row readable (client cannot read the queue — expected)");
  }

  // 1f — flip a QA verdict on an existing output row.
  const { data: qr } = await sb.from("qa_results").select("id, passed").limit(1).maybeSingle();
  if (qr) {
    await sb.from("qa_results").update({ passed: true }).eq("id", qr.id);
    const { data: a } = await sb.from("qa_results").select("passed").eq("id", qr.id).maybeSingle();
    const forged = a?.passed === true && qr.passed !== true;
    check("cannot flip qa_results.passed via REST", !forged);
    if (forged) toRevert.push(() => sb.from("qa_results").update({ passed: qr.passed }).eq("id", qr.id));
  } else {
    skip("cannot flip qa_results.passed via REST", "no qa_results row readable");
  }

  // 1g — approve a flagged output directly (bypass QA).
  const { data: out } = await sb.from("outputs").select("id, status").limit(1).maybeSingle();
  if (out) {
    await sb.from("outputs").update({ status: "approved" }).eq("id", out.id);
    const { data: a } = await sb.from("outputs").select("status").eq("id", out.id).maybeSingle();
    const forged = a?.status === "approved" && out.status !== "approved";
    check("cannot flip outputs.status=approved via REST", !forged);
    if (forged) toRevert.push(() => sb.from("outputs").update({ status: out.status }).eq("id", out.id));
  } else {
    skip("cannot flip outputs.status via REST", "no output row readable");
  }
} else {
  skip("targeted bios/ledger/qa/steward/output forge attacks", "no TEST_JWT — RLS-read of a target row not possible");
}

// ─────────────────────────────────────────────────────────────────────
// SECTION 2 — Role / authority escalation via REST
// ─────────────────────────────────────────────────────────────────────
console.log("\n── 2. Privilege escalation via REST ───────────────────────");

if (JWT) {
  // 2a — grant myself a steward role by writing team_members.
  const { data: me } = await sb.from("users").select("id, role, workspace_id").eq("id", (await sb.auth.getUser()).data.user?.id || "").maybeSingle();
  // team_members read policy is authenticated + active=true; try to escalate any readable row, else insert a new one.
  const { data: tm } = await sb.from("team_members").select("id, roles").limit(1).maybeSingle();
  if (tm) {
    const before = tm.roles || [];
    await sb.from("team_members").update({ roles: ["steward", "lead_steward"] }).eq("id", tm.id);
    const { data: a } = await sb.from("team_members").select("roles").eq("id", tm.id).maybeSingle();
    const forged = JSON.stringify(a?.roles) === JSON.stringify(["steward", "lead_steward"]) && JSON.stringify(before) !== JSON.stringify(a?.roles);
    check("cannot escalate team_members.roles via REST", !forged);
    if (forged) toRevert.push(() => sb.from("team_members").update({ roles: before }).eq("id", tm.id));
  } else {
    // No readable team_members row — try inserting one that names me a steward.
    const { data: ins, error } = await sb.from("team_members")
      .insert({ user_id: me?.id || randomUUID(), name: "probe", first_name: "probe", roles: ["lead_steward"], active: true }).select("id").maybeSingle();
    const forged = !error && !!ins?.id;
    check("cannot INSERT a self steward team_members row via REST", !forged, error?.message || "");
    if (forged) toDelete.push({ table: "team_members", id: ins.id });
  }

  // 2b — promote my own users.role to super_admin.
  if (me?.id) {
    await sb.from("users").update({ role: "super_admin" }).eq("id", me.id);
    const { data: a } = await sb.from("users").select("role").eq("id", me.id).maybeSingle();
    const forged = a?.role === "super_admin" && me.role !== "super_admin";
    check("cannot promote users.role to super_admin via REST", !forged);
    if (forged) toRevert.push(() => sb.from("users").update({ role: me.role }).eq("id", me.id));
  } else {
    skip("cannot promote users.role to super_admin via REST", "own users row not readable");
  }
} else {
  skip("team_members / users role-escalation attacks", "no TEST_JWT");
}

// ─────────────────────────────────────────────────────────────────────
// SECTION 3 — New M2/M3 server-authoritative tables (anon-testable)
// These require NO existing row and NO JWT: a revoked INSERT is rejected on
// privilege before FK/RLS is even evaluated, so a random UUID target is fine.
// ─────────────────────────────────────────────────────────────────────
console.log("\n── 3. M2/M3 table lockdown (write + read) ─────────────────");

async function attemptInsertBlocked(table, row) {
  const { data, error } = await sb.from(table).insert(row).select("id").maybeSingle();
  const created = !error && !!data?.id;
  check(`cannot INSERT into ${table} via REST`, !created, error?.message ? `blocked: ${error.message}` : (created ? "ROW CREATED" : ""));
  if (created) toDelete.push({ table, id: data.id });
}

const rnd = randomUUID();
await attemptInsertBlocked("bio_attestations", { bio_id: rnd, brand_id: rnd, payload_hash: "x", statement_version: "1", self_score: 100 });
await attemptInsertBlocked("cert_decisions", { bio_id: rnd, brand_id: rnd, actor_role: "steward", decision: "approve" });
await attemptInsertBlocked("cert_rubric_versions", { version: 999999, config: { forged: true }, active: false });
await attemptInsertBlocked("discovery_sessions", { brand_id: rnd, workspace_id: rnd, draft_payload: {} });
await attemptInsertBlocked("discovery_delegations", { brand_id: rnd, chapter: "voice", invitee_email: "x@x.com", token: rnd });

// Read side: these tables have RLS enabled with NO client policy → a client
// SELECT must return zero rows (never other tenants' cert/attestation data).
async function attemptReadEmpty(table) {
  const { data, error } = await sb.from(table).select("id").limit(1);
  // A permission-denied error OR an empty result both mean "no leak". A
  // non-empty data array means the table is client-readable (leak).
  const leaked = !error && Array.isArray(data) && data.length > 0;
  check(`${table} is not client-readable via REST`, !leaked, error?.message ? `denied: ${error.message}` : (leaked ? "ROWS RETURNED" : "empty"));
}
await attemptReadEmpty("cert_decisions");
await attemptReadEmpty("bio_attestations");
await attemptReadEmpty("cert_rubric_versions");

// ─────────────────────────────────────────────────────────────────────
// SECTION 4 — Tenant read isolation
// ─────────────────────────────────────────────────────────────────────
console.log("\n── 4. Tenant read isolation ───────────────────────────────");

if (JWT) {
  // Every brand the client can read must share one workspace_id (its own).
  const { data: brands, error } = await sb.from("brands").select("id, workspace_id").limit(200);
  if (error) {
    check("brands RLS returns only the caller's workspace", false, error.message);
  } else {
    const wsIds = [...new Set((brands || []).map((b) => b.workspace_id))];
    check("brands RLS returns exactly one workspace to the caller", wsIds.length <= 1, `distinct workspace_ids seen: ${wsIds.length}`);
  }

  // steward_jobs must be invisible to a plain client (queue is steward-only).
  const { data: sj } = await sb.from("steward_jobs").select("id").limit(1);
  check("steward_jobs queue not readable by a plain client", !(Array.isArray(sj) && sj.length > 0), Array.isArray(sj) ? `${sj.length} rows` : "none");
} else {
  skip("tenant read-isolation assertions", "no TEST_JWT");
}

// ─────────────────────────────────────────────────────────────────────
// SECTION 5 — HTTP gate + delegation-token scope (needs API_BASE)
// ─────────────────────────────────────────────────────────────────────
console.log("\n── 5. HTTP gate + delegation token (API_BASE) ─────────────");

if (API_BASE) {
  // 5a — /api/runs/stream must reject an unauthenticated caller.
  try {
    const r = await fetch(`${API_BASE}/api/runs/stream`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ specialistId: "a12", briefText: "probe" }),
    });
    check("/api/runs/stream rejects missing auth (401)", r.status === 401, `status ${r.status}`);
  } catch (e) {
    skip("/api/runs/stream rejects missing auth", `API unreachable: ${e.message}`);
  }

  // 5b — production gate: an uncertified brand must 409 BIO_NOT_CERTIFIED.
  if (JWT && UNCERTIFIED_BRAND_ID) {
    try {
      const r = await fetch(`${API_BASE}/api/runs/stream`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${JWT}` },
        body: JSON.stringify({ specialistId: "a12", briefText: "probe", brandId: UNCERTIFIED_BRAND_ID }),
      });
      const txt = await r.text();
      const gated = r.status === 409 && /BIO_NOT_CERTIFIED|NO_BIO/.test(txt);
      check("production run BLOCKED on an uncertified brand (409)", gated, `status ${r.status}`);
    } catch (e) {
      skip("production run BLOCKED on an uncertified brand", `API unreachable: ${e.message}`);
    }
  } else {
    skip("production run BLOCKED on an uncertified brand", "need TEST_JWT + TEST_UNCERTIFIED_BRAND_ID");
  }

  // 5c — delegation token endpoint must not leak on an unknown token.
  try {
    const r = await fetch(`${API_BASE}/api/discovery/delegation/${randomUUID()}`);
    check("unknown delegation token returns 404 (no leak)", r.status === 404, `status ${r.status}`);
  } catch (e) {
    skip("unknown delegation token returns 404", `API unreachable: ${e.message}`);
  }
} else {
  skip("HTTP gate + delegation-token probes", "API_BASE unset");
}

// ─────────────────────────────────────────────────────────────────────
// Cleanup — undo anything a vuln let us create (there should be nothing).
// ─────────────────────────────────────────────────────────────────────
if (toDelete.length || toRevert.length) {
  console.log("\n── cleanup (a vuln created state — reverting) ─────────────");
  for (const fn of toRevert) { try { await fn(); } catch (e) { console.warn("revert failed:", e.message); } }
  for (const { table, id } of toDelete) { try { await sb.from(table).delete().eq("id", id); console.warn(`deleted forged ${table} ${id}`); } catch (e) { console.warn(`cleanup delete ${table} ${id} failed:`, e.message); } }
}

console.log(
  failures === 0
    ? `\n✓ All attempted attacks were blocked (${skips} skipped for missing creds).`
    : `\n✗ ${failures} attack(s) SUCCEEDED — a live vulnerability is open (${skips} skipped).`
);
process.exit(failures === 0 ? 0 : 1);

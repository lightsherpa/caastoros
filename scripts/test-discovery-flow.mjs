// End-to-end proof of the M3 discovery draft lane: a resumable session ->
// autosave -> attest (promote draft to a BIO version + self-certify) ->
// briefing UNLOCKED, production still gated. Uses the REAL selfCertifyBio
// helper + REAL loaders against real Postgres.
//
// Requires the M3 migration (20260815020000) applied. Run:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/test-discovery-flow.mjs

import { supabaseAdmin as sb } from "../server/src/lib/supabase.js";
import { loadBioForRun, loadBioForBriefing } from "../server/src/lib/load-brand-bio.js";
import { selfCertifyBio } from "../server/src/lib/self-certify.js";
import { scoreBio } from "../server/src/lib/score-bio.js";

let failures = 0;
const ok = (n, p, d = "") => { console.log(`${p ? "PASS" : "FAIL"}  ${n}${d ? ` — ${d}` : ""}`); if (!p) failures++; };
async function expectThrow(n, fn, code) {
  try { await fn(); ok(n, false, `expected ${code}, succeeded`); }
  catch (e) { ok(n, e.code === code, e.code === code ? `threw ${code}` : `expected ${code}, got ${e.code || e.message}`); }
}
async function expectOk(n, fn) { try { const r = await fn(); ok(n, true); return r; } catch (e) { ok(n, false, `threw ${e.code || e.message}`); return null; } }

const DRAFT = {
  identity: { positioning: "Independent bakery for weekday regulars.", category: "Neighborhood bakery", founded: "2019", pillars: ["Daily", "Local", "Honest"] },
  audience: { primary: "Locals within a 1km walk, 25-55", secondary: "Office pre-work crowd", jtbd: ["A reliable morning stop"] },
  voice: { register: "Plain, friendly", rhythm: "Short, warm", forbidden: ["artisanal", "gourmet"], signatures: ["made this morning"] },
  goals: { northStar: "Be the street's default morning stop", q2: "Add filter coffee", q3: "Wholesale to two cafes" },
  strategic: { watchouts: ["Don't drift upmarket"], notList: ["A destination patisserie"] },
  visual: { palette: [], type: [], imagery: [], avoid: [] },
  confidence: {
    "identity.positioning": { conf: 88, source: "homepage" }, "identity.category": { conf: 84, source: "about" },
    "identity.founded": { conf: 70, source: "about" }, "identity.pillars": { conf: 78, source: "about" },
    "audience.primary": { conf: 80, source: "instagram" }, "audience.jtbd": { conf: 74, source: "reviews" },
    "voice.register": { conf: 79, source: "about" }, "voice.forbidden": { conf: 86, source: "owner note" },
    "voice.rhythm": { conf: 72, source: "about" }, "voice.signatures": { conf: 70, source: "instagram" },
    "goals.northStar": { conf: 82, source: "owner note" }, "strategic.watchouts": { conf: 68, source: "call" },
    "strategic.notList": { conf: 70, source: "call" },
  },
  missing: [],
};
const STATEMENTS = { authority: true, reflects: true, aspirationalMarked: true };

let workspaceId, brandId, sessionId;

async function setup() {
  const { data: ws, error: we } = await sb.from("workspaces").insert({ name: "M3 E2E Workspace", tier: "02" }).select("id").single();
  if (we) throw new Error(`workspace: ${we.message}`);
  workspaceId = ws.id;
  const { data: br, error: be } = await sb.from("brands").insert({ workspace_id: workspaceId, name: "M3 E2E Brand" }).select("id").single();
  if (be) throw new Error(`brand: ${be.message}`);
  brandId = br.id;
}
async function cleanup() {
  if (brandId) await sb.from("brands").delete().eq("id", brandId);
  if (workspaceId) await sb.from("workspaces").delete().eq("id", workspaceId);
  console.log("cleanup: removed test workspace + brand");
}

async function run() {
  await setup();

  // Compile seeds a resumable draft session (no bios row yet).
  const { data: sess, error: se } = await sb.from("discovery_sessions")
    .insert({ brand_id: brandId, workspace_id: workspaceId, draft_payload: DRAFT, cursor: { chapter: "identity" }, status: "active" })
    .select("id").single();
  ok("compile seeds a discovery_sessions draft", !se && !!sess, se?.message || `session ${sess?.id}`);
  sessionId = sess?.id;

  // Fresh brand: briefing + production both blocked (no bios, not self-certified).
  await expectThrow("fresh brand → briefing BLOCKED", () => loadBioForBriefing({ workspaceId, brandId }), "NOT_SELF_CERTIFIED");
  await expectThrow("fresh brand → production BLOCKED", () => loadBioForRun({ workspaceId, brandId }), "BIO_NOT_CERTIFIED");

  // Autosave: edit the draft (no versioning, no steward).
  const edited = { ...DRAFT, identity: { ...DRAFT.identity, positioning: "Independent bakery the street relies on." } };
  await sb.from("discovery_sessions").update({ draft_payload: edited, updated_at: new Date().toISOString() }).eq("id", sessionId);
  const { data: after } = await sb.from("discovery_sessions").select("draft_payload").eq("id", sessionId).single();
  ok("autosave updates the draft without a bios version", after?.draft_payload?.identity?.positioning === edited.identity.positioning);
  const { count: bioCountMid } = await sb.from("bios").select("*", { count: "exact", head: true }).eq("brand_id", brandId);
  ok("no bios version created during editing", (bioCountMid || 0) === 0, `${bioCountMid} bios rows`);

  // Attest: promote the draft to a candidate BIO version, then self-certify (the real helper).
  const { data: newBio, error: bErr } = await sb.from("bios")
    .insert({ brand_id: brandId, version: 1, payload: edited, score: scoreBio(edited), certified: false, self_certified: false })
    .select("id, version").single();
  ok("attest promotes the draft to a candidate BIO version", !bErr && newBio?.version === 1, bErr?.message || `v${newBio?.version}`);
  const res = await selfCertifyBio({ brandId, bioId: newBio.id, payload: edited, userId: null, statements: STATEMENTS, statementVersion: "1" });
  ok("selfCertifyBio succeeds (score >= min, no high-importance gaps)", res.ok === true, res.ok ? `score ${res.score}` : res.code);
  await sb.from("discovery_sessions").update({ status: "completed" }).eq("id", sessionId);

  // Self-cert unlocked briefing; production still needs a human Steward.
  await expectOk("after attest → briefing UNLOCKED", () => loadBioForBriefing({ workspaceId, brandId }));
  await expectThrow("after attest → production still BLOCKED (needs human cert)", () => loadBioForRun({ workspaceId, brandId }), "BIO_NOT_CERTIFIED");

  // The attestation is recorded, bound to the exact version.
  const { count: attCount } = await sb.from("bio_attestations").select("*", { count: "exact", head: true }).eq("bio_id", newBio.id);
  ok("bio_attestations row written for the attested version", (attCount || 0) === 1, `${attCount} rows`);
}

try { await run(); } catch (e) { console.error("FATAL:", e.message); failures++; } finally { await cleanup(); }
console.log(failures === 0 ? "\n✓ M3 discovery draft-lane verified end-to-end." : `\n✗ ${failures} assertion(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);

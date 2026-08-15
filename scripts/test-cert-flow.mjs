// End-to-end proof that the certification chain PERFORMS real DB changes and
// the data-layer gate enforces them. Uses the REAL loaders (load-brand-bio.js)
// and REAL rubric engine (evaluate-certification.js) against a real Postgres.
//
// Run against an isolated local Supabase:
//   supabase start
//   SUPABASE_URL=<local api url> SUPABASE_SERVICE_ROLE_KEY=<local service key> \
//     node scripts/test-cert-flow.mjs
//
// Proves the chain: uncertified → run BLOCKED → self-cert → briefing OK →
// rubric review → certified → run OK → decert → run BLOCKED (briefing stays).

import { supabaseAdmin as sb } from "../server/src/lib/supabase.js";
import { loadBioForRun, loadBioForBriefing } from "../server/src/lib/load-brand-bio.js";
import { evaluateCertification } from "../server/src/lib/evaluate-certification.js";
import { scoreBio, scoreBioBreakdown } from "../server/src/lib/score-bio.js";
import { computeFocus } from "../server/src/lib/bio-focus.js";
import { payloadHash } from "../server/src/lib/bio-hash.js";

let failures = 0;
const ok = (name, pass, detail = "") => { console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`); if (!pass) failures++; };
async function expectThrow(name, fn, code) {
  try { await fn(); ok(name, false, `expected ${code}, but it succeeded`); }
  catch (e) { ok(name, e.code === code, e.code === code ? `threw ${code}` : `expected ${code}, got ${e.code || e.message}`); }
}
async function expectOk(name, fn) {
  try { const r = await fn(); ok(name, true); return r; }
  catch (e) { ok(name, false, `threw ${e.code || e.message}`); return null; }
}

const PAYLOAD = {
  identity: { positioning: "Specialty coffee for slow mornings.", category: "Specialty coffee", founded: "2021", pillars: ["Provenance", "Ritual", "Patience"] },
  audience: { primary: "Urban remote workers 28-40", secondary: "Local walk-ins", jtbd: ["A calmer start to the day"] },
  voice: { register: "Warm, unhurried", rhythm: "Short. Then long.", forbidden: ["hustle", "grind"], signatures: ["on purpose"] },
  goals: { northStar: "Own the Tuesday morning ritual", q2: "Summer campaign", q3: "New origin" },
  strategic: { watchouts: ["Don't over-rotate on slowness"], notList: ["A discount brand"] },
  visual: { palette: [], type: [], imagery: [], avoid: [] },
  confidence: {
    "identity.positioning": { conf: 90, source: "homepage" }, "identity.category": { conf: 85, source: "about" },
    "identity.founded": { conf: 70, source: "about" }, "identity.pillars": { conf: 80, source: "about" },
    "audience.primary": { conf: 82, source: "instagram" }, "audience.secondary": { conf: 65, source: "maps" },
    "audience.jtbd": { conf: 78, source: "brand deck" }, "voice.register": { conf: 80, source: "about" },
    "voice.forbidden": { conf: 88, source: "tone guide" }, "voice.rhythm": { conf: 75, source: "about" },
    "voice.signatures": { conf: 72, source: "tone guide" }, "goals.northStar": { conf: 84, source: "founder note" },
    "strategic.watchouts": { conf: 70, source: "call" }, "strategic.notList": { conf: 72, source: "call" },
  },
  missing: [],
};

let workspaceId, brandId, bioId;

async function setup() {
  const { data: ws, error: wErr } = await sb.from("workspaces").insert({ name: "E2E Test Workspace", tier: "02" }).select("id").single();
  if (wErr) throw new Error(`workspace insert: ${wErr.message}`);
  workspaceId = ws.id;
  const { data: br, error: bErr } = await sb.from("brands").insert({ workspace_id: workspaceId, name: "E2E Test Brand" }).select("id").single();
  if (bErr) throw new Error(`brand insert: ${bErr.message}`);
  brandId = br.id;
  const { data: bio, error: bioErr } = await sb.from("bios")
    .insert({ brand_id: brandId, version: 1, payload: PAYLOAD, score: scoreBio(PAYLOAD), certified: false, self_certified: false })
    .select("id").single();
  if (bioErr) throw new Error(`bio insert: ${bioErr.message}`);
  bioId = bio.id;
  console.log(`setup: workspace ${workspaceId}, brand ${brandId}, bio ${bioId}, score ${scoreBio(PAYLOAD)}`);
}

async function cleanup() {
  if (brandId) await sb.from("brands").delete().eq("id", brandId);      // cascades bios → attestations/decisions
  if (workspaceId) await sb.from("workspaces").delete().eq("id", workspaceId);
  console.log("cleanup: removed test workspace + brand");
}

async function run() {
  await setup();

  // 1. Uncertified → production blocked, briefing blocked.
  await expectThrow("uncertified BIO → production run BLOCKED", () => loadBioForRun({ workspaceId, brandId }), "BIO_NOT_CERTIFIED");
  await expectThrow("uncertified BIO → briefing BLOCKED (no self-cert)", () => loadBioForBriefing({ workspaceId, brandId }), "NOT_SELF_CERTIFIED");

  // 2. Self-certify (stage 1) — replicates the endpoint's preconditions + writes.
  const highGaps = computeFocus(PAYLOAD).filter((f) => f.status === "missing" && f.importance >= 1.0);
  ok("self-cert precondition: no high-importance gaps", highGaps.length === 0);
  ok("self-cert precondition: score ≥ 58", scoreBio(PAYLOAD) >= 58, `score ${scoreBio(PAYLOAD)}`);
  await sb.from("bio_attestations").insert({ bio_id: bioId, brand_id: brandId, attested_by: null, payload_hash: payloadHash(PAYLOAD), statement_version: "1", field_marks: {}, self_score: scoreBio(PAYLOAD) });
  await sb.from("bios").update({ self_certified: true, self_certified_at: new Date().toISOString() }).eq("id", bioId);

  await expectOk("after self-cert → briefing UNLOCKED", () => loadBioForBriefing({ workspaceId, brandId }));
  await expectThrow("after self-cert → production still BLOCKED", () => loadBioForRun({ workspaceId, brandId }), "BIO_NOT_CERTIFIED");

  // 3. Human certification (stage 2) — real engine decides from reviewer scores.
  const bd = scoreBioBreakdown(PAYLOAD);
  const reviewerScores = { C3: { score: 4, confidence: 2 }, C4: { score: 4, confidence: 2 }, C5: { score: 4, confidence: 2 }, C6: { score: 4, confidence: 2 }, C7: { score: 4, confidence: 2 } };
  const decision = evaluateCertification({ autoSignals: { coverage: bd.coverage, avgConf: bd.avgConf, sourceDiversity: bd.sourceDiversity }, reviewerScores });
  ok("rubric engine recommends approve", decision.recommendedDecision === "approve", `${decision.recommendedDecision} @ ${decision.composite}`);
  await sb.from("bios").update({ certified: true, certified_at: new Date().toISOString(), cert_kind: "onboarding", cert_valid_until: new Date(Date.now() + 180 * 86400000).toISOString() }).eq("id", bioId);
  await sb.from("cert_decisions").insert({ bio_id: bioId, brand_id: brandId, actor_role: "steward", decision: decision.recommendedDecision, composite_score: decision.composite, band: decision.band, criterion_scores: decision.breakdown, bio_payload_hash: payloadHash(PAYLOAD) });

  const certified = await expectOk("after human cert → production UNLOCKED", () => loadBioForRun({ workspaceId, brandId }));
  ok("production loads the certified version", certified?.bio?.certified === true);
  const { count: decCount } = await sb.from("cert_decisions").select("*", { count: "exact", head: true }).eq("brand_id", brandId);
  ok("cert_decisions audit row written", (decCount || 0) >= 1, `${decCount} rows`);

  // 4. Decertify — production re-blocks, briefing stays up.
  await sb.from("bios").update({ certified: false, cert_valid_until: null }).eq("id", bioId);
  await sb.from("cert_decisions").insert({ bio_id: bioId, brand_id: brandId, actor_role: "super_admin", decision: "decertify", reject_reason_code: "e2e_test", bio_payload_hash: payloadHash(PAYLOAD) });
  await expectThrow("after decert → production BLOCKED again", () => loadBioForRun({ workspaceId, brandId }), "BIO_NOT_CERTIFIED");
  await expectOk("after decert → briefing STAYS UP (self-cert untouched)", () => loadBioForBriefing({ workspaceId, brandId }));
}

try {
  await run();
} catch (e) {
  console.error("FATAL:", e.message);
  failures++;
} finally {
  await cleanup();
}
console.log(failures === 0 ? "\n✓ Full cert chain verified end-to-end." : `\n✗ ${failures} assertion(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);

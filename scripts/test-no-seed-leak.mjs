// Guards the fix for the cross-brand BIO leak: load-brand-bio.js used to
// return a hardcoded seed brand's BIO + refusals whenever a brand had no BIO
// of its own, which put that brand's positioning into other brands' prompts.
//
// ponytail: static check, not a behavioural one. loadBrandBio imports
// supabaseAdmin at module scope so it can't be exercised without a live DB;
// if that ever gets injectable, replace this with a real no-BIO-throws test.
//
// Run: node scripts/test-no-seed-leak.mjs

import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";

const root = new URL("..", import.meta.url).pathname;

// 1. The seed brand fixture is gone.
assert.equal(
  existsSync(`${root}server/src/data/vinilo.js`),
  false,
  "server/src/data/vinilo.js is back — it is a seed brand, not shared config",
);

// 2. Nothing on the server references a seed brand's data.
// grep exits 1 on no matches — that is the passing case, so swallow it.
let hits = "";
try {
  hits = execFileSync("grep", ["-rilE", "VINILO_|data/vinilo", `${root}server/src`], {
    encoding: "utf8",
  }).trim();
} catch (e) {
  if (e.status !== 1) throw e;
}
assert.equal(hits, "", `server still references seed brand data:\n${hits}`);

// 3. A brand with no BIO must throw, never fall back to someone else's.
const loader = readFileSync(`${root}server/src/lib/load-brand-bio.js`, "utf8");
const noBioBlock = loader.slice(loader.indexOf("if (!bioRow)"));
assert.match(
  noBioBlock.slice(0, 600),
  /throw\s+(?:err|bioError\()/,
  "load-brand-bio no-BIO path must throw, not return a fallback BIO",
);
assert.doesNotMatch(
  loader,
  /refusals:\s*brandRow\.refusals\?\.length\s*\?/,
  "refusals must not fall back to another brand's list",
);

console.log("ok — no seed-brand leak on the server");

// ── CAA-25 regression: Steward BIO-patch integrity ──────────────────
// Static guards (steward.js needs a live DB to exercise) that the patch path
// keeps score + metadata in sync with the values instead of hardcoding them.
const steward = readFileSync(`${root}server/src/routes/steward.js`, "utf8");
const patchStart = steward.indexOf("const hasBioPatch");
assert.notEqual(patchStart, -1, "steward patch handling must be present");
const patchBlock = steward.slice(patchStart);

assert.doesNotMatch(
  patchBlock.slice(0, 1800),
  /score:\s*75\b/,
  "steward patch must not hardcode score: 75 — use scoreBio(merged)",
);
assert.match(
  patchBlock.slice(0, 1800),
  /(?:score|p_score):\s*scoreBio\(/,
  "steward patch must score the merged payload with scoreBio()",
);
assert.match(
  patchBlock.slice(0, 1800),
  /deepMerge\(/,
  "steward patch must deep-merge the bioPatch so sibling fields survive",
);
assert.match(
  patchBlock.slice(0, 1800),
  /normalizeBioEvidence\(/,
  "steward patch must re-derive confidence/missing/evidence via normalizeBioEvidence()",
);
assert.doesNotMatch(
  patchBlock.slice(0, 1800),
  /\{\s*\.\.\.bio\.payload,\s*\.\.\.body\.bioPatch\s*\}/,
  "steward patch must not shallow-spread the bioPatch (drops sibling subtrees)",
);

// ── CAA-25 regression: tier-2 gate mechanism is wired ───────────────
assert.match(
  loader,
  /bioQuery\.eq\("certified", true\)/,
  "load-brand-bio must filter production reads to human-certified BIOs",
);
assert.match(
  loader,
  /loadBrandBio\(\{ workspaceId, brandId, requireCertified: true \}\)/,
  "loadBioForRun must always enforce human certification",
);
assert.match(loader, /cert_valid_until/, "the human-cert gate must honor certification TTL");

console.log("ok — CAA-25 steward-patch integrity + tier-2 gate wired");

// ── CAA-25 P1: enforcement decision recorded + claim aligned ────────
// Brandolph's call is ENFORCE (prod REQUIRE_HUMAN_CERT=1), with the moat
// stated honestly: the BIO is human-certified; outputs are optionally
// human-finished — NOT "every output is certified". Guard both.

assert.equal(
  existsSync(`${root}docs/tier2-enforcement-runbook.md`),
  true,
  "tier-2 enforcement runbook must exist so the prod flip is sequenced safely",
);

// Marketing/product copy must not over-claim that every OUTPUT is certified.
const auth = readFileSync(`${root}src/portal-auth.jsx`, "utf8");
const team = readFileSync(`${root}src/portal-team.jsx`, "utf8");
const discovery = readFileSync(`${root}src/portal-discovery.jsx`, "utf8");
assert.doesNotMatch(
  auth,
  /every output certified by a senior human/,
  "auth hero must not over-claim 'every output certified by a senior human' (BIO is certified, not every output)",
);
assert.doesNotMatch(
  team,
  /every output ships/,
  "team view must not over-claim 'every output ships certified by …'",
);
assert.doesNotMatch(
  discovery,
  /every output your Specialists produce/,
  "discovery copy must not claim every output is certified — the BIO is",
);
assert.match(
  auth,
  /human finishing/,
  "auth hero must state the true guarantee: certified BIO + optional human finishing",
);

// ── CAA-25 P2: DISCOVERY_V2 no longer silently drops user materials ──
const compileBio = readFileSync(
  `${root}server/src/inngest/functions/compile-bio.js`,
  "utf8",
);
assert.match(
  compileBio,
  /gather-upload-sources/,
  "compile-bio must gather uploaded materials before synthesis",
);
assert.match(
  compileBio,
  /independent of DISCOVERY_V2/,
  "compile-bio must not drop uploaded materials when Discovery V2 is disabled",
);

console.log("ok — CAA-25 enforcement decision recorded, claim aligned, materials signalled");
// ─────────────────────────────────────────────────────────────────────
// CAA-28 — extend the guard to the CLIENT bundle (src/).
//
// The server / model-prompt path was already clean, but the browser SPA
// still hardcoded the seed brand's identity in window.CI_* (src/portal-data.js
// + a few screens): Vinilo's brand + workspaces, its steward (Marina), the
// "11.4× pricing formula" refusal, and the Honduras origin story. Those are
// display-only, but they render live to every user and read as another
// brand's data leaking. This mirrors the NEEDLES check in
// scripts/test-e2e-flow.mjs, but statically over the shipped source so it
// runs with zero external deps (same contract as the server checks above).
//
// "11.4" is matched only with its × / x suffix (the pricing formula) so the
// guard doesn't trip on SVG <path> coordinate data that contains "11.4".
const CLIENT_NEEDLES = ["vinilo", "honduras", "marina", "11\\.4\\s*[×x]"];
let clientHits = "";
try {
  clientHits = execFileSync(
    "grep",
    ["-rniE", CLIENT_NEEDLES.join("|"), `${root}src`],
    { encoding: "utf8" },
  ).trim();
} catch (e) {
  if (e.status !== 1) throw e; // grep exits 1 on no matches — the passing case.
}
assert.equal(
  clientHits,
  "",
  `client bundle (src/) still renders seed-brand identity — purge it (CAA-28):\n${clientHits}`,
);

console.log("ok — no seed-brand leak in the client bundle (src/)");

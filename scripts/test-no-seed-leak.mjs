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
  noBioBlock.slice(0, 400),
  /throw err/,
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
const patchBlock = steward.slice(steward.indexOf("if (body.bioPatch"));

assert.doesNotMatch(
  patchBlock.slice(0, 900),
  /score:\s*75\b/,
  "steward patch must not hardcode score: 75 — use scoreBio(merged)",
);
assert.match(
  patchBlock.slice(0, 900),
  /score:\s*scoreBio\(/,
  "steward patch must score the merged payload with scoreBio()",
);
assert.match(
  patchBlock.slice(0, 900),
  /deepMerge\(/,
  "steward patch must deep-merge the bioPatch so sibling fields survive",
);
assert.match(
  patchBlock.slice(0, 900),
  /normalizeBioEvidence\(/,
  "steward patch must re-derive confidence/missing/evidence via normalizeBioEvidence()",
);
assert.doesNotMatch(
  patchBlock.slice(0, 900),
  /\{\s*\.\.\.bio\.payload,\s*\.\.\.body\.bioPatch\s*\}/,
  "steward patch must not shallow-spread the bioPatch (drops sibling subtrees)",
);

// ── CAA-25 regression: tier-2 gate mechanism is wired ───────────────
assert.match(
  loader,
  /requireHumanCert/,
  "load-brand-bio must expose the tier-2 (human cert) gate",
);
assert.match(
  loader,
  /REQUIRE_HUMAN_CERT/,
  "loadBioForRun must read REQUIRE_HUMAN_CERT to enforce human certification",
);

console.log("ok — CAA-25 steward-patch integrity + tier-2 gate wired");

// ── CAA-25 P1: enforcement decision recorded + claim aligned ────────
// Brandolph's call is ENFORCE (prod REQUIRE_HUMAN_CERT=1), with the moat
// stated honestly: the BIO is human-certified; outputs are optionally
// human-finished — NOT "every output is certified". Guard both.

const env = readFileSync(`${root}server/.env.example`, "utf8");
assert.match(
  env,
  /PRODUCTION ENFORCES/,
  ".env.example must record the CAA-25 decision that prod enforces tier-2",
);
assert.match(
  env,
  /docs\/tier2-enforcement-runbook\.md/,
  ".env.example must point ops at the enforcement runbook",
);
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
  /materials\.synthesis/,
  "compile-bio must flag a materials.synthesis 'missing' entry when V2 is off but materials were provided",
);
assert.match(
  compileBio,
  /synthesized:\s*V2 &&/,
  "compile-bio must record whether user materials were actually synthesized",
);

console.log("ok — CAA-25 enforcement decision recorded, claim aligned, materials signalled");

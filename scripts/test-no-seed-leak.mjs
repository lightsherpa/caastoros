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

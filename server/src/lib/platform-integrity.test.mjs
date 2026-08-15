import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isAllowedModelOverride, routeCreditMultiplier } from "./models/router.js";

const read = (path) => readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");

test("browser model overrides are finite and route-priced", () => {
  assert.equal(isAllowedModelOverride("anthropic/claude-sonnet-4-6"), true);
  assert.equal(isAllowedModelOverride("openrouter/any/arbitrary-expensive-model"), false);
  assert.ok(routeCreditMultiplier("anthropic/claude-opus-4-7") > routeCreditMultiplier("anthropic/claude-sonnet-4-6"));
  assert.ok(routeCreditMultiplier("openrouter/google/gemini-2.5-flash") < routeCreditMultiplier("anthropic/claude-sonnet-4-6"));
});

test("corrective migration removes client write authority and protects views", () => {
  const sql = read("supabase/migrations/20260815000000_platform_integrity.sql");
  assert.match(sql, /revoke all on table workspaces, brands, bios/);
  assert.match(sql, /grant select on table workspaces, brands, bios/);
  assert.match(sql, /with \(security_invoker = true\)/);
  assert.match(sql, /create or replace function reserve_workspace_credits/);
  assert.match(sql, /create or replace function finalize_run_atomic/);
  assert.match(sql, /create or replace function fail_run_and_release_credits/);
  assert.match(sql, /create or replace function submit_steward_job_atomic/);
  assert.match(sql, /create or replace function claim_billing_event/);
  assert.match(sql, /create unique index if not exists one_open_steward_job_per_bio/);
  assert.match(sql, /grant select \(id, name, first_name, avatar_url, roles, active\)/);
  assert.doesNotMatch(sql, /grant all on .*authenticated/i);
});

test("specialist execution requires a certified BIO and atomic persistence", () => {
  const source = read("server/src/routes/runs.js");
  assert.match(source, /loadBioForRun\(\{ workspaceId, brandId \}\)/);
  assert.match(source, /isAllowedModelOverride\(modelOverride\)/);
  assert.match(source, /reserveCredits\(/);
  assert.match(source, /rpc\("finalize_run_atomic"/);
  assert.match(source, /failRunAndReleaseCredits\(/);
  assert.doesNotMatch(source, /requireCertified:\s*false/);
});

test("Steward submission preserves the audited rubric state machine", () => {
  const source = read("server/src/routes/steward.js");
  assert.match(source, /evaluateCertification\(/);
  assert.match(source, /writeDecision\(/);
  assert.match(source, /rpc\("append_bio_version"/);
  assert.match(source, /normalizeBioEvidence\(deepMerge\(/);
  assert.doesNotMatch(source, /score:\s*75/);
});

test("Discovery uploads sources before enqueue and has no demo default/results", () => {
  const source = read("src/portal-discovery.jsx");
  const upload = source.indexOf("const filesToUpload");
  const enqueue = source.indexOf('const res = await apiFetch("/api/discovery/start"');
  assert.ok(upload >= 0 && enqueue > upload);
  assert.doesNotMatch(source, /useDState\("https?:\/\//);
  assert.doesNotMatch(source, /const d = window\.CI_DISCOVERY/);
});

test("Discovery carries an exact BIO correlation id through the worker", () => {
  const route = read("server/src/routes/discovery.js");
  const worker = read("server/src/inngest/functions/compile-bio.js");
  const migration = read("supabase/migrations/20260815000000_platform_integrity.sql");
  assert.match(route, /const discoveryId = crypto\.randomUUID\(\)/);
  assert.match(route, /data: \{ brandId, url, workspaceId, instagram, discoveryId \}/);
  assert.match(worker, /p_discovery_id: discoveryId \|\| null/);
  assert.match(migration, /alter table bios add column if not exists discovery_id text/);
});

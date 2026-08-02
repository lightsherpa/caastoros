// ─────────────────────────────────────────────────────────────────────
// P0-006 · Seed the `specs` table from src/portal-data.js
//
// Reads the expanded CI_AGENTS catalog + CI_DEPT_SPECS (department templates) +
// CI_DEPT_META (per-dept capabilities/tier) from the existing
// browser-side mock file, and writes one `specs` row per specialist
// with `version=1` and `active=true` (for live status) or `active=false`
// (for `soon` status — they get a row so the directory still renders).
//
// Run:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-specs.mjs
//
// Idempotent: uses upsert on (specialist_id, version) so re-running is
// safe and just overwrites the v1 payload. To bump a version, edit the
// SPEC_VERSION constant below.
//
// Why eval portal-data.js instead of importing? It's a browser script
// that assigns to `window.*`. Refactoring to ESM exports is in-scope
// for a later phase (when P3 wires real specialist runs and the mocks
// become DB-backed). For now this seed is the one consumer that needs
// the data on the server side; the sandbox eval keeps the source of
// truth single.
// ─────────────────────────────────────────────────────────────────────

import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const PORTAL_DATA_PATH = join(REPO_ROOT, "src/portal-data.js");
const SPEC_VERSION = 1;

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing env: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  console.error("Tip: set them inline, or use `--env-file=server/.env` with Node 20+.");
  process.exit(1);
}

// ─── Sandbox-evaluate portal-data.js to extract CI_* globals ────────
const src = readFileSync(PORTAL_DATA_PATH, "utf8");
const fakeWindow = {};
const sandbox = { window: fakeWindow, localStorage: { getItem: () => null, setItem: () => {} } };
createContext(sandbox);
runInContext(src, sandbox);

const CI_AGENTS    = fakeWindow.CI_AGENTS;
const CI_DEPT_SPECS = fakeWindow.CI_DEPT_SPECS;
const CI_DEPT_META  = fakeWindow.CI_DEPT_META;
const CI_SPECIALIST_SPECS = fakeWindow.CI_SPECIALIST_SPECS || {};

if (!Array.isArray(CI_AGENTS) || CI_AGENTS.length === 0) {
  console.error("CI_AGENTS not found or empty after evaluating portal-data.js");
  process.exit(1);
}
if (!CI_DEPT_SPECS || !CI_DEPT_META) {
  console.error("CI_DEPT_SPECS or CI_DEPT_META missing");
  process.exit(1);
}

console.log(`Loaded ${CI_AGENTS.length} agents from portal-data.js`);
console.log(`Departments: ${Object.keys(CI_DEPT_SPECS).join(", ")}`);

// ─── Vendor-prefixed model routing (hybrid: Anthropic direct + OpenRouter for non-Claude) ──
// Per the hybrid decision in docs/2026-05-24-engineering-refinement.md:
//   anthropic/<model>   → direct SDK, preserves cache_control (60–80% input cost lever)
//   openrouter/<model>  → OpenAI-compatible API, used for GPT-5 / Gemini / non-Claude text
//   vendor/<short_key>  → non-text vendors (image/web/deck/search/audio) — handled by
//                          dedicated modules in P5+; the text router rejects this prefix.
const MODEL_MAP = {
  // Anthropic (text) — direct
  opus:        "anthropic/claude-opus-5",   /* Opus 5 — same $5/$25 as 4.7, better reasoning, 512-token cache min (4.7 was 2048) */
  sonnet:      "anthropic/claude-sonnet-4-6",
  haiku:       "anthropic/claude-haiku-4-5-20251001",
  // Non-Claude text → OpenRouter
  gpt5:        "openrouter/openai/gpt-5",
  gemFlash36:  "openrouter/google/gemini-3.6-flash",   /* was misnamed "gemPro" — it is Flash, not Pro */
  gemFlash:    "openrouter/google/gemini-3.5-flash-lite",
  // Image — all via fal.ai (one key, one bill, multiple models)
  gptimage:    "vendor/fal/gpt-image-2",      /* real GPT Image 2 via fal (openai/gpt-image-2) */
  flux:        "vendor/fal/flux-1.1-pro",     /* Pro — Hero, OOH, Identity, Pack: $0.04/img */
  fluxSchnell: "vendor/fal/flux-schnell",     /* Schnell — drafts, variants, social: $0.003/img (13× cheaper) */
  recraft:     "vendor/fal/recraft-v3",
  // Other non-text vendors — wired in later phases
  exa:         "vendor/exa/search",          /* Exa web research (Site Scanner, Competitor Map) */
  elevenlabs:  "vendor/elevenlabs",           /* not integrated (audio — deferred) */
  gamma:       "vendor/gamma",                /* not integrated (decks — deferred) */
  /* v0/framer removed — Page Composer, Email Build, Framer Builder route to Sonnet (see CI_AGENTS). */
};

function resolveRoute(shortKey) {
  if (MODEL_MAP[shortKey]) return MODEL_MAP[shortKey];
  console.warn(`Unknown model short key "${shortKey}" — defaulting to anthropic/claude-sonnet-4-6`);
  return "anthropic/claude-sonnet-4-6";
}

const REQUIRED_SPEC_FIELDS = ["role", "objective", "method", "outputContract", "voice", "refusals", "bioSlices"];
const EXCLUDED_MOTION_VIDEO_IDS = new Set(["a44"]); // Style Frames is video preproduction despite living in Visual.

function defaultBioSlices(department) {
  return department === "Copy"           ? ["voice", "forbidden"]
       : department === "Visual"         ? ["palette", "type", "imagery"]
       : department === "Concept"        ? ["positioning", "audience"]
       : department === "Web & UX"       ? ["voice", "palette", "type"]
       : department === "Motion & Sound" ? ["voice", "imagery"]
       : department === "Strategy"       ? ["positioning", "audience", "goals", "strategic"]
       : department === "Research & Ops" ? ["positioning"]
       :                                    ["positioning", "voice"];
}

function assertInScopeSpecCoverage() {
  const failures = [];
  for (const agent of CI_AGENTS) {
    if (agent.dept === "Motion & Sound" || EXCLUDED_MOTION_VIDEO_IDS.has(agent.id)) continue;
    const override = CI_SPECIALIST_SPECS[agent.id];
    if (!override) {
      failures.push(`${agent.id}: missing bespoke CI_SPECIALIST_SPECS entry`);
      continue;
    }
    for (const field of REQUIRED_SPEC_FIELDS) {
      const value = override[field];
      const missing = value == null
        || (typeof value === "string" && value.trim() === "")
        || (Array.isArray(value) && value.length === 0);
      if (missing) failures.push(`${agent.id}: missing ${field}`);
    }
  }
  if (failures.length) {
    throw new Error(`In-scope specialist spec validation failed:\n- ${failures.join("\n- ")}`);
  }
}

assertInScopeSpecCoverage();

// ─── Build the spec payload per agent ──────────────────────────────
function buildPayload(agent) {
  const deptSpec = CI_DEPT_SPECS[agent.dept] ?? {};
  const deptMeta = CI_DEPT_META[agent.dept] ?? {};
  /* Per-specialist override (CI_SPECIALIST_SPECS) — every key present
     in the override replaces the dept-template default. Arrays REPLACE
     wholesale (don't merge), so a specialist can shrink the refusal
     list deliberately. */
  const override = CI_SPECIALIST_SPECS[agent.id] ?? {};
  const pick = (k) => (override[k] !== undefined ? override[k] : deptSpec[k]);
  return {
    // Identity
    name: agent.name,
    code: agent.code,
    department: agent.dept,
    role_label: "L2 specialist",                  // used by public_specs view
    job: agent.job,
    public_description: agent.job,                 // safe to expose via `?ask=`
    // Visibility — internal specs (BIO Compiler, Audit & Ledger) are
    // infrastructure, not user-pickable. The directory filters them out.
    internal: agent.internal === true,
    // Spec — override wins over dept template per-field
    role: pick("role"),
    objective: pick("objective"),
    method: pick("method") ?? [],
    outputContract: pick("outputContract"),
    evidenceContract: pick("evidenceContract"),
    handoffContract: pick("handoffContract") ?? pick("handoffRequirements"),
    structuredOutput: pick("structuredOutput"),
    qaContract: pick("qaContract"),
    voice: pick("voice"),
    tools: pick("tools") ?? [],
    refusals: pick("refusals") ?? [],
    qaGates: pick("qaGates") ?? [],
    // Routing — vendor-prefixed route string the model router dispatches on
    modelRouting: { primary: resolveRoute(agent.model), fallback: null, reason: `seeded from CI_AGENTS (model: ${agent.model})` },
    // Department-inherited
    capabilities: deptMeta.capabilities ?? [],
    turnaround: deptMeta.turnaround,
    tierFrom: deptMeta.tierFrom,
    bestFor: deptMeta.bestFor,
    deptComingSoon: deptMeta.comingSoon === true,
    // Estimates + status (status mirrors agent.status; active flag on the row reflects live-ness)
    cr_estimate: agent.cr,
    status: agent.status,
    // BIO slices per dept — what the specialist reads from the BIO at run time
    bioSlices: pick("bioSlices") ?? defaultBioSlices(agent.dept),
  };
}

// ─── Upsert into specs via REST (service-role bypasses RLS) ────────
const rows = CI_AGENTS.map((agent) => ({
  specialist_id: agent.id,
  version:       SPEC_VERSION,
  active:        agent.status === "live",
  payload:       buildPayload(agent),
}));

const url = `${SUPABASE_URL}/rest/v1/specs?on_conflict=specialist_id,version`;
const res = await fetch(url, {
  method:  "POST",
  headers: {
    "apikey":        SUPABASE_SERVICE_ROLE_KEY,
    "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type":  "application/json",
    "Prefer":        "resolution=merge-duplicates,return=minimal",
  },
  body: JSON.stringify(rows),
});

if (!res.ok) {
  const body = await res.text();
  console.error(`Upsert failed: HTTP ${res.status}`);
  console.error(body.slice(0, 800));
  process.exit(1);
}

console.log(`Upserted ${rows.length} spec rows (version ${SPEC_VERSION}).`);

// ─── Verify by counting back ───────────────────────────────────────
const countRes = await fetch(`${SUPABASE_URL}/rest/v1/specs?select=specialist_id`, {
  headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
});
const all = await countRes.json();
const liveCount = rows.filter((r) => r.active).length;
console.log(`Verification: ${all.length} total spec rows in DB (${liveCount} active, ${rows.length - liveCount} soon).`);

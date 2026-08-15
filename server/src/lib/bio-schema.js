// Single source of truth for BIO shape: the field registry, the
// normalization boundary (normalizeBio), and the event-sourced
// projection (projectBio). Pure — no DB, no network.
//
// Why this exists: the BIO payload shape was defined by example in 5+
// disagreeing places (vinilo seed, compiler schema, score-bio, bio-focus,
// two renderers). This module makes the shape ONE thing. Every read and
// write should pass through normalizeBio so no consumer ever touches a
// raw payload — which is also what fixes the renderBioLayer null-crash.
//
// M0 models the CURRENT (baseline) payload shape. The deep v1.0 content
// model (identity.essence, positioning.statement, voice.byLocale, …)
// lands in M4 by ADDING registry entries — nothing here is renamed or
// removed, so a 6-month-old BIO keeps reading.

export const SCHEMA_VERSION = "1.0";

// Field registry — one entry per guaranteed leaf field.
//   path:   [section, key]
//   kind:   "scalar" | "list" | "objlist"
//   slice:  the bioSlice this field belongs to (T1 per-department slicing)
//   scored: counts toward scoreBio coverage. The scored subset MUST equal
//           the historical SCORED_PATHS exactly (asserted in the test) so
//           unifying the list here changes no scoring behavior.
export const BIO_FIELDS = [
  { path: ["identity", "positioning"], kind: "scalar",  slice: "positioning", scored: true },
  { path: ["identity", "category"],    kind: "scalar",  slice: "positioning", scored: true },
  { path: ["identity", "founded"],     kind: "scalar",  slice: "positioning", scored: true },
  { path: ["identity", "pillars"],     kind: "list",    slice: "positioning", scored: true },
  { path: ["audience", "primary"],     kind: "scalar",  slice: "audience",    scored: true },
  { path: ["audience", "secondary"],   kind: "scalar",  slice: "audience",    scored: true },
  { path: ["audience", "tertiary"],    kind: "scalar",  slice: "audience",    scored: true },
  { path: ["audience", "jtbd"],        kind: "list",    slice: "audience",    scored: true },
  { path: ["voice", "register"],       kind: "scalar",  slice: "voice",       scored: true },
  { path: ["voice", "forbidden"],      kind: "list",    slice: "forbidden",   scored: true },
  { path: ["voice", "rhythm"],         kind: "scalar",  slice: "voice",       scored: true },
  { path: ["voice", "signatures"],     kind: "list",    slice: "voice",       scored: true },
  { path: ["goals", "northStar"],      kind: "scalar",  slice: "goals",       scored: true },
  { path: ["goals", "q2"],             kind: "scalar",  slice: "goals",       scored: true },
  { path: ["goals", "q3"],             kind: "scalar",  slice: "goals",       scored: true },
  { path: ["strategic", "watchouts"],  kind: "list",    slice: "strategic",   scored: true },
  { path: ["strategic", "notList"],    kind: "list",    slice: "strategic",   scored: true },
  // visual — rendered and sliced, but NOT scored (matches historical scoring).
  { path: ["visual", "palette"],       kind: "objlist", slice: "palette",     scored: false },
  { path: ["visual", "type"],          kind: "objlist", slice: "type",        scored: false },
  { path: ["visual", "imagery"],       kind: "list",    slice: "palette",     scored: false },
  { path: ["visual", "avoid"],         kind: "list",    slice: "palette",     scored: false },
];

// Section order is registry order, deduped.
export const SECTIONS = BIO_FIELDS.reduce(
  (acc, f) => (acc.includes(f.path[0]) ? acc : [...acc, f.path[0]]),
  [],
);

// Scored leaf paths, derived from the registry — the single source
// scoreBio consumes (was a hardcoded list inside score-bio.js).
export const SCORED_PATHS = BIO_FIELDS.filter((f) => f.scored).map((f) => f.path);

const isObj = (v) => v != null && typeof v === "object" && !Array.isArray(v);
const stable = (v) => JSON.stringify(v ?? null);
const defaultFor = (kind) => (kind === "scalar" ? "" : []);

function sectionSkeleton(section) {
  const skel = {};
  for (const f of BIO_FIELDS) if (f.path[0] === section) skel[f.path[1]] = defaultFor(f.kind);
  return skel;
}

/**
 * The single normalization/validation boundary. Guarantees every
 * registered section and field is present (arrays default to [], scalars
 * to ""), preserves every existing value and any extra keys (meta like
 * version/score, legacy like identity.name), stamps schema_version, and
 * is idempotent. This is the null-safety fix: a partial payload can no
 * longer make a renderer throw.
 *
 * @param {object} raw - a BIO payload (optionally with meta keys merged on)
 * @returns {object} CanonicalBio
 */
export function normalizeBio(raw = {}) {
  const src = isObj(raw) ? raw : {};
  const out = { ...src };
  for (const section of SECTIONS) {
    out[section] = { ...sectionSkeleton(section), ...(isObj(src[section]) ? src[section] : {}) };
  }
  out.confidence = isObj(src.confidence) ? src.confidence : {};
  out.missing = Array.isArray(src.missing) ? src.missing : [];
  out.conflicts = Array.isArray(src.conflicts) ? src.conflicts : [];
  out.schema_version = src.schema_version || SCHEMA_VERSION;
  return out;
}

function setLeaf(obj, path, value) {
  const [s, k] = path;
  if (!isObj(obj[s])) obj[s] = {};
  obj[s][k] = value;
}

/**
 * Fold an append-only assertion log into a canonical BIO projection.
 * State derives from history, never hand-written. Deterministic:
 * identical assertion sets produce identical output regardless of input
 * order.
 *
 * Assertion shape (the contract discovery must emit in M3):
 *   { field_path: "identity.positioning", value,
 *     confidence?: 0..100, source?: string, source_ref?: id,
 *     asserted_by?: id, asserted_role?: string,
 *     stated_or_inferred?: "stated" | "inferred",
 *     human_confirmed?: boolean, seq: number }
 *
 * Resolution rule per field: a human-confirmed assertion wins; among the
 * winning set, the highest seq wins. Divergent UNCONFIRMED values (with
 * no human resolution) are surfaced in conflicts[] — never averaged,
 * never silently picked (the tentative payload takes the latest, but the
 * conflict is flagged for the reviewer).
 *
 * @param {object[]} assertions
 * @returns {{ payload: object, confidence: object, missing: object[], conflicts: object[] }}
 */
export function projectBio(assertions = []) {
  const list = (Array.isArray(assertions) ? assertions : [])
    .filter((a) => a && typeof a.field_path === "string")
    .slice()
    .sort((a, b) => (a.seq - b.seq) || (stable(a) < stable(b) ? -1 : 1));

  const byField = new Map();
  for (const a of list) {
    const g = byField.get(a.field_path) || [];
    g.push(a);
    byField.set(a.field_path, g);
  }

  const payload = {};
  const confidence = {};
  const conflicts = [];

  for (const [field, group] of byField) {
    const confirmed = group.filter((a) => a.human_confirmed);
    const pool = confirmed.length ? confirmed : group;
    const winner = pool.reduce((x, y) => (y.seq >= x.seq ? y : x));

    const path = field.split(".");
    if (path.length === 2) setLeaf(payload, path, winner.value);

    if (typeof winner.confidence === "number") {
      confidence[field] = { conf: winner.confidence, source: winner.source || "" };
    }

    if (!confirmed.length) {
      const distinct = new Set(group.map((a) => stable(a.value)));
      if (distinct.size > 1) {
        conflicts.push({
          field_path: field,
          values: group.map((a) => ({
            value: a.value,
            source: a.source || null,
            asserted_by: a.asserted_by || null,
            seq: a.seq,
          })),
        });
      }
    }
  }

  const missing = BIO_FIELDS
    .filter((f) => !byField.has(f.path.join(".")))
    .map((f) => ({ field: f.path.join("."), why: "no assertion recorded" }));

  return {
    payload: normalizeBio({ ...payload, confidence, missing, conflicts }),
    confidence,
    missing,
    conflicts,
  };
}

// ── M4 · agent read-contract ────────────────────────────────────────────
// getBioForAgent produces the cache-ordered BIO content blocks every agent
// reads: a brand-constant CORE block (a shared cache prefix across all the
// specialists), a per-department SLICE block, and provenance-as-exceptions
// (low-confidence inline markers + a "do not invent these gaps" line) so the
// BIO's honesty reaches the agent within the token budget. Depth lives in
// T2 deep fields (param reserved); the always-injected CORE stays small.

const AGENT_LABELS = {
  "identity.positioning": "POSITIONING", "identity.category": "CATEGORY",
  "identity.founded": "FOUNDED", "identity.pillars": "PILLARS",
  "audience.primary": "PRIMARY AUDIENCE", "audience.secondary": "SECONDARY AUDIENCE",
  "audience.tertiary": "TERTIARY AUDIENCE", "audience.jtbd": "JOBS-TO-BE-DONE",
  "voice.register": "VOICE REGISTER", "voice.rhythm": "RHYTHM",
  "voice.forbidden": "FORBIDDEN WORDS (never use)", "voice.signatures": "SIGNATURES",
  "goals.northStar": "NORTH STAR", "goals.q2": "THIS QUARTER", "goals.q3": "NEXT QUARTER",
  "strategic.watchouts": "WATCHOUTS", "strategic.notList": "WHAT THE BRAND IS NOT",
  "visual.palette": "PALETTE", "visual.type": "TYPE", "visual.imagery": "IMAGERY", "visual.avoid": "AVOID",
};

// T0 CORE — injected for EVERY agent; brand-constant so it caches once and is
// reused across all specialists of the brand.
const CORE_KEYS = new Set([
  "identity.positioning", "identity.category", "identity.pillars",
  "voice.register", "voice.forbidden", "audience.primary", "goals.northStar",
]);
const LOW_CONF = 70;
const isFilled = (v) => (Array.isArray(v) ? v.length > 0 : v != null && String(v).trim() !== "");

function renderValue(kind, v) {
  if (kind === "objlist") {
    return v.map((o) => {
      if (o == null || typeof o !== "object") return String(o ?? "");
      if ("hex" in o) return `${o.name || ""} ${o.hex || ""}`.trim();
      if ("family" in o) return `${o.kind || ""}: ${o.family || ""}`.trim();
      return Object.values(o).filter(Boolean).join(" ");
    }).filter(Boolean).join(", ");
  }
  return Array.isArray(v) ? v.join(", ") : String(v);
}

function renderAgentField(bio, field) {
  const [s, k] = field.path;
  const key = `${s}.${k}`;
  const v = bio?.[s]?.[k];
  if (!isFilled(v)) return null;
  const conf = bio?.confidence?.[key]?.conf;
  const marker = typeof conf === "number" && conf < LOW_CONF ? " (inferred — low confidence, do not assert as fact)" : "";
  return `${AGENT_LABELS[key] || k}: ${renderValue(field.kind, v)}${marker}`;
}

/**
 * Machine projection of provenance for an agent's field set — the registered
 * fields it would read that the BIO does NOT carry (so the prompt can forbid
 * inventing them). Distinct from computeFocus (the human Steward projection).
 * @param {object} bio
 * @param {Set<string>} keys  "section.key" set the agent reads
 * @returns {{ missing: string[] }}
 */
export function computeAgentProvenance(bio, keys) {
  const b = normalizeBio(bio);
  const missing = [];
  for (const f of BIO_FIELDS) {
    const key = `${f.path[0]}.${f.path[1]}`;
    if (!keys.has(key)) continue;
    if (!isFilled(b?.[f.path[0]]?.[f.path[1]])) missing.push(AGENT_LABELS[key] || f.path[1]);
  }
  return { missing };
}

function gapLine(bio, keys) {
  const { missing } = computeAgentProvenance(bio, keys);
  return missing.length
    ? `\nThe BIO does not specify: ${missing.join("; ")}. Do not invent these — if the task needs one, say so plainly.`
    : "";
}

/**
 * The single agent-facing BIO read. Returns cache-ordered content blocks that
 * replace the hand-rendered BIO layer in both the specialist and Brandolph
 * prompt builders.
 * @param {object} args
 * @param {object} args.bio                 BIO payload (normalized internally)
 * @param {"specialist"|"brandolph"} args.audience
 * @param {string[]} [args.slices]          spec.payload.bioSlices (specialist T1 selector)
 * @param {string[]} [args.refusals]        brand-global refusals
 * @param {string[]} [args.deepFields]      T2 keyed fields (reserved; none wired yet)
 * @returns {{ blocks: {type:string,text:string,cache_control?:object}[] }}
 */
export function getBioForAgent({ bio, audience = "specialist", slices = [], refusals = [], deepFields = [] } = {}) {
  const b = normalizeBio(bio);
  const sliceSet = new Set(Array.isArray(slices) && slices.length ? slices : ["positioning", "voice", "audience"]);
  const ver = b.version != null ? ` · v${b.version}` : "";

  // CORE (T0) — every agent, brand-constant.
  const coreLines = [];
  for (const f of BIO_FIELDS) {
    if (!CORE_KEYS.has(`${f.path[0]}.${f.path[1]}`)) continue;
    const line = renderAgentField(b, f);
    if (line) coreLines.push(line);
  }
  let coreText = `## BRAND INTELLIGENCE OBJECT${ver} — core\n${coreLines.join("\n") || "(core fields not yet specified)"}${gapLine(b, CORE_KEYS)}`;
  if (Array.isArray(refusals) && refusals.length) {
    coreText += `\n\nBRAND-GLOBAL REFUSALS (never violate):\n${refusals.map((r, i) => `${i + 1}. ${r}`).join("\n")}`;
  }
  const blocks = [{ type: "text", text: coreText, cache_control: { type: "ephemeral" } }];

  // SLICE (T1) — per department for specialists; the full BIO for Brandolph.
  const sliceKeys = new Set();
  const sliceLines = [];
  for (const f of BIO_FIELDS) {
    const key = `${f.path[0]}.${f.path[1]}`;
    if (CORE_KEYS.has(key)) continue;
    if (!(audience === "brandolph" || sliceSet.has(f.slice))) continue;
    sliceKeys.add(key);
    const line = renderAgentField(b, f);
    if (line) sliceLines.push(line);
  }
  if (sliceKeys.size) {
    blocks.push({
      type: "text",
      text: `## BIO — detail\n${sliceLines.join("\n") || "(no additional fields specified)"}${gapLine(b, sliceKeys)}`,
      cache_control: { type: "ephemeral" },
    });
  }

  // T2 deep fields — keyed fetch; none wired until the deep-schema follow-up.
  // ponytail: add a block per deep field when one actually exists.
  void deepFields;

  return { blocks };
}

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

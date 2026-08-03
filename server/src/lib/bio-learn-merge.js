// ─────────────────────────────────────────────────────────────────────
// P4 · BIO learning loop — pure merge of learned patches.
//
// Brandolph learns from a brand's approved/edited work and proposes BIO
// field improvements. This function folds those proposals into a BIO
// payload under strict MOAT rules:
//   • Fill gaps (empty/missing fields) freely.
//   • Strengthen only LOW-confidence fields (curConf < maxOverwriteConf).
//   • NEVER silently overwrite a confident, human-shaped value
//     (curConf ≥ maxOverwriteConf) — those are protected.
//
// PURE, no I/O. Never mutates its input. Never adds/sets a `certified`
// key. Never touches `version`. The learned BIO always lands as an
// UNCERTIFIED draft that a senior human re-certifies elsewhere.
//
// Confidence lives in the sibling-map shape (per the BIO discovery plan):
//   payload.confidence["<section>.<key>"] = { conf: 0..100, source }
// Values stay plain strings/arrays on payload.<section>.<key>.
// ─────────────────────────────────────────────────────────────────────

// Empty/missing = null/undefined, blank string, or empty array. Mirrors
// the nonEmpty convention used by score-bio.js / bio-focus.js.
const isEmpty = (v) =>
  v == null ||
  (typeof v === "string" && v.trim() === "") ||
  (Array.isArray(v) && v.length === 0);

// Deep clone so the input payload is never mutated. structuredClone is
// available on Node 18+; JSON round-trip is a safe fallback (payload is
// always JSON-serializable — it's a jsonb column).
const clone = (o) =>
  typeof structuredClone === "function"
    ? structuredClone(o ?? {})
    : JSON.parse(JSON.stringify(o ?? {}));

const getPath = (obj, path) =>
  path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);

function setPath(obj, path, value) {
  const keys = path.split(".");
  const last = keys.pop();
  let node = obj;
  for (const k of keys) {
    if (node[k] == null || typeof node[k] !== "object") node[k] = {};
    node = node[k];
  }
  node[last] = value;
}

/**
 * Fold learned patches into a BIO payload under the MOAT rules above.
 *
 * @param {object} payload  current BIO payload (confidence sibling-map on payload.confidence)
 * @param {Array}  patches  [{ path:"identity.positioning", value:<string|array>, conf:0-100, source:"learned from work · <evidence>" }]
 * @param {object} [opts]
 * @param {number} [opts.maxOverwriteConf=80]  confident-value protection floor
 * @returns {{ payload: object, changedCount: number, changes: Array<{path:string, before:*, after:*}> }}
 */
export function mergeLearnedPatch(payload, patches, { maxOverwriteConf = 80 } = {}) {
  const next = clone(payload ?? {});
  if (!next.confidence || typeof next.confidence !== "object") next.confidence = {};
  const changes = [];

  for (const patch of Array.isArray(patches) ? patches : []) {
    if (!patch || typeof patch.path !== "string" || !patch.path) continue; // ignore malformed patch
    const { path, value, conf, source } = patch;

    const cur = getPath(next, path);
    // curConf read from the ORIGINAL input confidence map, per contract.
    const curConf = payload?.confidence?.[path]?.conf ?? 0;

    // Apply ONLY IF the field is a gap OR its current confidence is below
    // the protection floor. A confident, human-shaped value is left alone.
    if (!isEmpty(cur) && curConf >= maxOverwriteConf) continue;

    setPath(next, path, value);
    next.confidence[path] = { conf, source };
    changes.push({ path, before: cur ?? null, after: value });
  }

  return { payload: next, changedCount: changes.length, changes };
}

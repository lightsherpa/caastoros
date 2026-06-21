// bio-focus.js — Increment 5 (Steward focus list).
//
// Pure, no I/O. Turns a BIO payload into a ranked "focus first" list for the
// human Steward: gaps (missing fields) first, then present-but-low-confidence
// fields ranked by importance × (1 − conf/100). High-confidence fields
// (conf ≥ DROP_CONF) are dropped — the Steward shouldn't spend attention there.
//
// FROZEN CONTRACT: export function computeFocus(payload = {}) -> FocusItem[]
//
// Reads the sibling-map confidence shape:
//   payload.confidence["<section>.<key>"] = { conf: 0..100, source }
//   values on  payload.<section>.<key>
//   gaps on    payload.missing = [{ field: "<dotted.path>", why }]
//
// FocusItem = { field, label, status, importance, priority, conf, value, source, why, action }

// Importance keyed to downstream blast radius — how many specialists inherit
// the field. Anything not listed defaults to 0.3 (low impact).
const IMPORTANCE = {
  "identity.positioning": 1.0, "voice.forbidden": 1.0, "audience.primary": 1.0,
  "identity.category": 0.6, "identity.pillars": 0.6, "voice.register": 0.6,
  "audience.jtbd": 0.6, "goals.northStar": 0.6,
  "voice.signatures": 0.3, "audience.secondary": 0.3, "goals.q2": 0.3, "goals.q3": 0.3, "identity.founded": 0.3,
};

const LABELS = {
  "identity.positioning": "Positioning", "voice.forbidden": "Forbidden words", "audience.primary": "Primary audience",
  "identity.category": "Category", "identity.pillars": "Pillars", "voice.register": "Voice register",
  "audience.jtbd": "Jobs-to-be-done", "goals.northStar": "North star", "voice.signatures": "Voice signatures",
  "audience.secondary": "Secondary audience", "goals.q2": "Q2 priority", "goals.q3": "Q3 priority", "identity.founded": "Founded",
};

const DROP_CONF = 92;

const imp = (f) => IMPORTANCE[f] ?? 0.3;
const get = (p, path) => path.split(".").reduce((o, k) => o?.[k], p);

function whyFor(f) {
  return imp(f) >= 1.0 ? "Every specialist inherits this."
    : imp(f) >= 0.6 ? "Several specialists draw on it."
      : "Low downstream impact — quick confirm.";
}

function actionFor(field, label, status, source) {
  if (status === "missing") return `${label} is empty — fill it from a source before certifying.`;
  if (source && /infer/i.test(source)) return `Confirm ${label.toLowerCase()} — inferred, not stated.`;
  return `Verify ${label.toLowerCase()}${source ? ` against ${source}` : ""}.`;
}

export function computeFocus(payload = {}) {
  const conf = payload.confidence || {};
  const gaps = (Array.isArray(payload.missing) ? payload.missing : [])
    .map((g) => (typeof g === "string" ? g : g.field))
    .filter(Boolean);
  const items = [];

  // 1) Gaps bucket — missing fields always come first.
  for (const field of gaps) {
    items.push({
      field,
      label: LABELS[field] || field,
      status: "missing",
      importance: imp(field),
      priority: imp(field),
      conf: null,
      value: null,
      source: null,
      why: whyFor(field),
      action: actionFor(field, LABELS[field] || field, "missing", null),
    });
  }

  // 2) Present-but-low-confidence fields, ranked by importance × (1 − conf/100).
  const gapSet = new Set(gaps);
  for (const field of Object.keys(IMPORTANCE)) {
    if (gapSet.has(field)) continue;
    const c = conf[field]?.conf;
    if (typeof c !== "number" || c >= DROP_CONF) continue;
    const priority = imp(field) * (1 - c / 100);
    items.push({
      field,
      label: LABELS[field] || field,
      status: "low_conf",
      importance: imp(field),
      priority,
      conf: c,
      value: get(payload, field) ?? null,
      source: conf[field]?.source ?? null,
      why: whyFor(field),
      action: actionFor(field, LABELS[field] || field, "low_conf", conf[field]?.source),
    });
  }

  return items.sort((a, b) =>
    (a.status === "missing") !== (b.status === "missing")
      ? (a.status === "missing" ? -1 : 1)
      : b.priority - a.priority || b.importance - a.importance || a.field.localeCompare(b.field));
}

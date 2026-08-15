// bio-diff.js — field-level diff of two BIO payloads.
//
// Pure, no I/O. Powers the Steward ↔ client review loop: when a Steward edits
// the BIO before certifying, the client needs to see WHAT changed. Both inputs
// pass through the schema's normalizeBio boundary so every registered leaf is
// present, then each leaf whose stringified value differs becomes one entry.
//
// FROZEN CONTRACT: diffBio(prevPayload, nextPayload) -> DiffEntry[]
//   DiffEntry = { field, label, before, after }
//   `field`  = dotted path ("voice.register")
//   `label`  = human-readable name
//   `before` / `after` = rendered values (arrays joined by ", ")
// Returns [] when the payloads are equal or when prev is null/absent.
//
// Self-check: diffBio({voice:{register:"warm"}}, {voice:{register:"crisp"}})
//   → [{ field:"voice.register", label:"Voice register", before:"warm", after:"crisp" }]

import { BIO_FIELDS, normalizeBio } from "./bio-schema.js";

// Readable names for every registered leaf (extends the LABELS idea from
// bio-focus.js to the full registry, incl. the non-scored visual fields).
const LABELS = {
  "identity.positioning": "Positioning",
  "identity.category": "Category",
  "identity.founded": "Founded",
  "identity.pillars": "Pillars",
  "audience.primary": "Primary audience",
  "audience.secondary": "Secondary audience",
  "audience.tertiary": "Tertiary audience",
  "audience.jtbd": "Jobs-to-be-done",
  "voice.register": "Voice register",
  "voice.forbidden": "Forbidden words",
  "voice.rhythm": "Voice rhythm",
  "voice.signatures": "Voice signatures",
  "goals.northStar": "North star",
  "goals.q2": "Q2 priority",
  "goals.q3": "Q3 priority",
  "strategic.watchouts": "Watchouts",
  "strategic.notList": "Not-list",
  "visual.palette": "Palette",
  "visual.type": "Typography",
  "visual.imagery": "Imagery",
  "visual.avoid": "Visual avoid",
};

// One array item → a readable string. Objects (palette/type entries) render as
// their primitive values joined by a space (e.g. "Ink #101820").
function renderItem(it) {
  if (it != null && typeof it === "object") {
    return Object.values(it)
      .filter((v) => v != null && typeof v !== "object")
      .map(String)
      .join(" ")
      .trim();
  }
  return String(it ?? "");
}

// A leaf value → its rendered display string.
function render(value) {
  if (value == null) return "";
  if (Array.isArray(value)) return value.map(renderItem).filter(Boolean).join(", ");
  if (typeof value === "object") return renderItem(value);
  return String(value);
}

/**
 * Diff two BIO payloads leaf-by-leaf over the field registry.
 * @param {object|null} prevPayload
 * @param {object} nextPayload
 * @returns {{ field: string, label: string, before: string, after: string }[]}
 */
export function diffBio(prevPayload, nextPayload) {
  if (prevPayload == null) return [];
  const prev = normalizeBio(prevPayload);
  const next = normalizeBio(nextPayload);
  const out = [];
  for (const f of BIO_FIELDS) {
    const [section, key] = f.path;
    const before = prev[section]?.[key];
    const after = next[section]?.[key];
    if (JSON.stringify(before ?? null) === JSON.stringify(after ?? null)) continue;
    const field = f.path.join(".");
    out.push({ field, label: LABELS[field] || field, before: render(before), after: render(after) });
  }
  return out;
}

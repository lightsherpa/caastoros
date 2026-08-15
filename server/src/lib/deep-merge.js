// Recursive deep merge for BIO payloads — pure, non-mutating.
//
// A Steward (or the editor) submits a partial `bioPatch`. A shallow spread
// (`{ ...base, ...patch }`) replaces whole subtrees: a patch that only touches
// `identity.positioning` wipes `identity.category`, `identity.founded`, etc.
// deepMerge instead walks plain objects and only overwrites the leaves the
// patch actually names.
//
// Semantics:
//   - both sides plain objects  → recurse (siblings survive)
//   - anything else in the patch → replaces the base value wholesale.
//     Arrays REPLACE (never concatenate) — editing `voice.forbidden` to a new
//     list means exactly that list, not the union with the old one.
//   - `undefined` in the patch is ignored (keeps the base value); `null`
//     explicitly clears the field.

function isPlainObject(v) {
  return v != null && typeof v === "object" && !Array.isArray(v);
}

export function deepMerge(base, patch) {
  if (!isPlainObject(patch)) return patch === undefined ? base : patch;
  const out = isPlainObject(base) ? { ...base } : {};
  for (const [key, patchVal] of Object.entries(patch)) {
    if (patchVal === undefined) continue;
    if (isPlainObject(patchVal) && isPlainObject(out[key])) {
      out[key] = deepMerge(out[key], patchVal);
    } else {
      out[key] = patchVal;
    }
  }
  return out;
}

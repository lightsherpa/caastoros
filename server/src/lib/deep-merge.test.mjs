import { test } from "node:test";
import assert from "node:assert/strict";
import { deepMerge } from "./deep-merge.js";

test("keeps sibling keys when patching a nested subtree", () => {
  const base = { identity: { positioning: "old", category: "coffee", founded: "2019" } };
  const patch = { identity: { positioning: "new" } };
  assert.deepEqual(deepMerge(base, patch), {
    identity: { positioning: "new", category: "coffee", founded: "2019" },
  });
});

test("arrays replace wholesale, never concatenate", () => {
  const base = { voice: { forbidden: ["cheap", "hype"] } };
  const patch = { voice: { forbidden: ["salesy"] } };
  assert.deepEqual(deepMerge(base, patch).voice.forbidden, ["salesy"]);
});

test("adds keys that exist only in the patch", () => {
  assert.deepEqual(deepMerge({ a: 1 }, { b: 2 }), { a: 1, b: 2 });
});

test("null explicitly clears a field; undefined is ignored", () => {
  assert.deepEqual(deepMerge({ a: 1, b: 2 }, { a: null, b: undefined }), { a: null, b: 2 });
});

test("does not mutate its inputs", () => {
  const base = { identity: { positioning: "old", category: "coffee" } };
  const patch = { identity: { positioning: "new" } };
  const snapshot = JSON.parse(JSON.stringify(base));
  deepMerge(base, patch);
  assert.deepEqual(base, snapshot);
});

test("patch object over a non-object base replaces it", () => {
  assert.deepEqual(deepMerge({ visual: null }, { visual: { palette: ["#000"] } }), {
    visual: { palette: ["#000"] },
  });
});

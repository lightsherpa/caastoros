// server/src/lib/delivery-plan.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizePlan, wrapLegacy, estimateCr, MAX_COUNT } from "./delivery-plan.js";

test("normalizePlan fills parts/crew from taxonomy and clamps count", () => {
  const out = normalizePlan({
    deliverableGroups: [{ type: "social_post", count: 999, platforms: ["instagram", "linkedin"] }],
  });
  const g = out.deliverableGroups[0];
  assert.equal(g.count, MAX_COUNT);                 // clamped
  assert.deepEqual(g.parts, ["caption", "image"]);  // filled from taxonomy
  assert.equal(g.crew.image, "a41");                // filled from taxonomy
  assert.deepEqual(g.platforms, ["instagram", "linkedin"]);
});

test("normalizePlan drops unknown types and bad platforms, defaults platform", () => {
  const out = normalizePlan({
    deliverableGroups: [
      { type: "nonsense", count: 2 },
      { type: "email", count: 3, platforms: ["myspace"] },
    ],
  });
  assert.equal(out.deliverableGroups.length, 1);            // nonsense dropped
  assert.equal(out.deliverableGroups[0].type, "email");
  assert.deepEqual(out.deliverableGroups[0].platforms, ["generic"]); // bad platform -> default
});

test("normalizePlan derives unique proposedSpecialists across groups", () => {
  const out = normalizePlan({
    deliverableGroups: [
      { type: "social_post", count: 5, platforms: ["instagram"] }, // a16, a41
      { type: "email", count: 2 },                                  // a14, a13
    ],
  });
  assert.deepEqual([...out.proposedSpecialists].sort(), ["a13", "a14", "a16", "a41"]);
});

test("normalizePlan returns empty plan for junk input", () => {
  assert.deepEqual(normalizePlan(null), { deliverableGroups: [], proposedSpecialists: [] });
  assert.deepEqual(normalizePlan({}), { deliverableGroups: [], proposedSpecialists: [] });
});

test("wrapLegacy turns a flat specialist list into count:1 generic groups", () => {
  const out = wrapLegacy(["a12", "a18"]);
  assert.equal(out.deliverableGroups.length, 2);
  assert.equal(out.deliverableGroups[0].type, "legacy");
  assert.equal(out.deliverableGroups[0].count, 1);
  assert.deepEqual(out.deliverableGroups[0].platforms, ["generic"]);
  assert.equal(out.deliverableGroups[0].crew.output, "a12");
});

test("estimateCr multiplies count x platforms x sum(part cr); null without crOf", () => {
  const plan = normalizePlan({ deliverableGroups: [{ type: "social_post", count: 5, platforms: ["instagram", "linkedin"] }] });
  const crOf = (id) => ({ a16: 3, a41: 8 }[id] ?? 0);     // 11 per deliverable
  assert.equal(estimateCr(plan, crOf), 5 * 2 * 11);        // 110
  assert.equal(estimateCr(plan), null);                    // no crOf -> unknown
});

test("wrapLegacy drops non-string ids and proposedSpecialists matches groups", () => {
  const out = wrapLegacy(["a1", null, 42, "a1"]);
  assert.ok(out.deliverableGroups.every((g) => g.crew.output === "a1")); // null & 42 dropped from groups
  assert.deepEqual(out.proposedSpecialists, ["a1"]);                     // derived from groups: deduped, no ghosts
});

test("wrapLegacy with non-array input yields an empty plan", () => {
  const out = wrapLegacy("a12");
  assert.deepEqual(out.deliverableGroups, []);
  assert.deepEqual(out.proposedSpecialists, []);
});

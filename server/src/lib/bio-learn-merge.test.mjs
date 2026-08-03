import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeLearnedPatch } from "./bio-learn-merge.js";

// (a) fills a missing field (cur empty) and records confidence.
test("fills a missing field and records confidence", () => {
  const payload = { identity: { positioning: "" }, confidence: {} };
  const patches = [
    { path: "identity.positioning", value: "The city's third-place café.", conf: 70, source: "learned from work · approved Manifesto run" },
  ];
  const { payload: out, changedCount, changes } = mergeLearnedPatch(payload, patches);

  assert.equal(out.identity.positioning, "The city's third-place café.");
  assert.deepEqual(out.confidence["identity.positioning"], { conf: 70, source: "learned from work · approved Manifesto run" });
  assert.equal(changedCount, 1);
  // `before` honestly reflects the prior value (an empty string), not null.
  assert.deepEqual(changes[0], { path: "identity.positioning", before: "", after: "The city's third-place café." });
});

// (b) strengthens a low-confidence field (curConf 40 < 80) → overwritten.
test("strengthens a low-confidence field", () => {
  const payload = {
    identity: { category: "Coffee" },
    confidence: { "identity.category": { conf: 40, source: "inferred" } },
  };
  const patches = [
    { path: "identity.category", value: "Specialty coffee roaster", conf: 82, source: "learned from work · edited Product Copy" },
  ];
  const { payload: out, changedCount } = mergeLearnedPatch(payload, patches);

  assert.equal(out.identity.category, "Specialty coffee roaster");
  assert.equal(out.confidence["identity.category"].conf, 82);
  assert.equal(out.confidence["identity.category"].source, "learned from work · edited Product Copy");
  assert.equal(changedCount, 1);
});

// (c) does NOT overwrite a confident field (curConf 90) → unchanged,
//     and changedCount excludes it.
test("does not overwrite a confident field", () => {
  const payload = {
    identity: { positioning: "Human-certified positioning." },
    confidence: { "identity.positioning": { conf: 90, source: "steward" } },
  };
  const patches = [
    { path: "identity.positioning", value: "Model-proposed replacement.", conf: 75, source: "learned from work · social run" },
  ];
  const { payload: out, changedCount, changes } = mergeLearnedPatch(payload, patches);

  assert.equal(out.identity.positioning, "Human-certified positioning.");           // unchanged value
  assert.deepEqual(out.confidence["identity.positioning"], { conf: 90, source: "steward" }); // unchanged conf
  assert.equal(changedCount, 0);
  assert.equal(changes.length, 0);
});

// (c') confident field is skipped but a sibling gap in the same batch is still applied.
test("skips confident field but still fills a sibling gap in the same batch", () => {
  const payload = {
    identity: { positioning: "Human-certified positioning." },
    confidence: { "identity.positioning": { conf: 90, source: "steward" } },
  };
  const patches = [
    { path: "identity.positioning", value: "should not land", conf: 75, source: "learned from work · x" },
    { path: "voice.register", value: "Warm, unhurried", conf: 60, source: "learned from work · edits to Headlines" },
  ];
  const { payload: out, changedCount } = mergeLearnedPatch(payload, patches);

  assert.equal(out.identity.positioning, "Human-certified positioning.");
  assert.equal(out.voice.register, "Warm, unhurried"); // nested path auto-created
  assert.equal(changedCount, 1);
});

// (d) result never contains a `certified` key (top-level or nested).
test("result never contains a certified key", () => {
  const payload = { identity: { positioning: "" }, confidence: {} };
  const patches = [
    { path: "identity.positioning", value: "X", conf: 60, source: "learned from work · run" },
    { path: "voice.register", value: "Warm", conf: 55, source: "learned from work · edits" },
  ];
  const { payload: out } = mergeLearnedPatch(payload, patches);

  assert.equal("certified" in out, false);
  assert.equal(JSON.stringify(out).includes("certified"), false); // no nested certified anywhere
  assert.equal("version" in out, false);                          // version is never touched
});

// (e) input payload object is not mutated.
test("input payload object is not mutated", () => {
  const payload = {
    identity: { positioning: "", category: "Coffee" },
    confidence: { "identity.category": { conf: 40, source: "inferred" } },
  };
  const snapshot = JSON.parse(JSON.stringify(payload));

  mergeLearnedPatch(payload, [
    { path: "identity.positioning", value: "New value", conf: 70, source: "learned from work · run" },
    { path: "identity.category", value: "Roaster", conf: 85, source: "learned from work · run" },
  ]);

  assert.deepEqual(payload, snapshot);
});

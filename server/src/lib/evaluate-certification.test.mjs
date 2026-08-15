import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateCertification, DEFAULT_RUBRIC } from "./evaluate-certification.js";

const HUMAN = (score, confidence = 2) => ({ score, confidence });
const allHuman = (score, confidence = 2) => ({
  C3: HUMAN(score, confidence), C4: HUMAN(score, confidence), C5: HUMAN(score, confidence),
  C6: HUMAN(score, confidence), C7: HUMAN(score, confidence),
});
const HIGH_AUTO = { coverage: 1, avgConf: 1, sourceDiversity: 1 };

test("rubric weights sum to 1", () => {
  const sum = DEFAULT_RUBRIC.criteria.reduce((a, c) => a + c.weight, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9, `weights sum ${sum}`);
});

test("all-exemplary → composite 100, approve", () => {
  const r = evaluateCertification({ autoSignals: HIGH_AUTO, reviewerScores: allHuman(4) });
  assert.equal(r.incomplete, false);
  assert.equal(r.composite, 100);
  assert.equal(r.band, "approve");
  assert.equal(r.recommendedDecision, "approve");
  assert.equal(r.gateFailures.length, 0);
});

test("a gating criterion below floor caps an otherwise-high result at return_changes", () => {
  // Everything strong except C3 (gating, floor 3) at 2 → high composite but gate fails.
  const scores = { ...allHuman(4), C3: HUMAN(2) };
  const r = evaluateCertification({ autoSignals: HIGH_AUTO, reviewerScores: scores });
  assert.ok(r.composite >= 80, `composite ${r.composite} still high`);
  assert.equal(r.band, "approve");
  assert.ok(r.gateFailures.some((g) => g.id === "C3"));
  assert.equal(r.recommendedDecision, "return_changes"); // gate overrides the band
});

test("a gate at 0 forces reject regardless of composite", () => {
  const scores = { ...allHuman(4), C6: HUMAN(0) }; // C6 gating floor 2
  const r = evaluateCertification({ autoSignals: HIGH_AUTO, reviewerScores: scores });
  assert.equal(r.recommendedDecision, "reject");
});

test("low overall scores land in reject band", () => {
  const r = evaluateCertification({ autoSignals: { coverage: 0.2, avgConf: 0.2, sourceDiversity: 0 }, reviewerScores: allHuman(1) });
  assert.equal(r.band, "reject");
  assert.equal(r.recommendedDecision, "reject");
});

test("mid scores produce approve_with_conditions or return_changes bands", () => {
  const r = evaluateCertification({ autoSignals: { coverage: 0.8, avgConf: 0.8, sourceDiversity: 0.6 }, reviewerScores: allHuman(3) });
  assert.equal(r.incomplete, false);
  assert.ok(["approve_with_conditions", "return_changes", "approve"].includes(r.band));
  assert.ok(r.composite > 50 && r.composite < 100);
});

test("missing a human score → incomplete, no decision", () => {
  const scores = { C3: HUMAN(4), C4: HUMAN(4), C5: HUMAN(4), C6: HUMAN(4) }; // C7 missing
  const r = evaluateCertification({ autoSignals: HIGH_AUTO, reviewerScores: scores });
  assert.equal(r.incomplete, true);
  assert.deepEqual(r.missingScores, ["C7"]);
  assert.equal(r.recommendedDecision, null);
});

test("low reviewer confidence on a gating criterion flags calibration", () => {
  const scores = { ...allHuman(4), C3: HUMAN(4, 0) }; // C3 gating, confidence 0
  const r = evaluateCertification({ autoSignals: HIGH_AUTO, reviewerScores: scores });
  assert.equal(r.needsCalibration, true);
});

test("deterministic — same inputs, same output", () => {
  const args = { autoSignals: { coverage: 0.7, avgConf: 0.6, sourceDiversity: 0.4 }, reviewerScores: allHuman(3) };
  assert.deepEqual(evaluateCertification(args), evaluateCertification(args));
});

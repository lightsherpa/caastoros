import { test } from "node:test";
import assert from "node:assert/strict";
import { briefProgress, daysLeftInCycle, successRate } from "./home-stats.js";

const run = (status, outputStatuses = []) => ({
  status,
  outputs: outputStatuses.map((s, i) => ({ id: i, status: s })),
});

test("briefProgress: a running run is in flight regardless of outputs", () => {
  assert.equal(briefProgress({ runs: [run("running", ["approved"])] }), "in-flight");
  assert.equal(briefProgress({ runs: [run("queued")] }), "in-flight");
});

test("briefProgress: all outputs approved is shipped", () => {
  assert.equal(briefProgress({ runs: [run("completed", ["approved", "approved"])] }), "shipped");
  assert.equal(
    briefProgress({ runs: [run("completed", ["approved"]), run("completed", ["approved"])] }),
    "shipped",
  );
});

test("briefProgress: one unapproved output keeps the brief in flight", () => {
  assert.equal(briefProgress({ runs: [run("completed", ["approved", "pending"])] }), "in-flight");
  assert.equal(briefProgress({ runs: [run("completed", ["flagged"])] }), "in-flight");
  // A run that finished but produced nothing must not read as shipped.
  assert.equal(briefProgress({ runs: [run("failed")] }), "draft");
});

test("briefProgress: a brief that never ran is a draft, not a failure", () => {
  assert.equal(briefProgress({ runs: [] }), "draft");
  assert.equal(briefProgress({}), "draft");
});

test("successRate: never-fired drafts are excluded from the denominator", () => {
  assert.equal(successRate({ shipped: 1, inFlight: 1 }), 50);
  assert.equal(successRate({ shipped: 3, inFlight: 0 }), 100);
  // No work at all must be 0%, not NaN.
  assert.equal(successRate({ shipped: 0, inFlight: 0 }), 0);
});

test("daysLeftInCycle: counts to the first of next month", () => {
  assert.equal(daysLeftInCycle(new Date(2026, 0, 31, 12)), 1);   // 31 Jan → 1 Feb
  assert.equal(daysLeftInCycle(new Date(2026, 0, 1, 0)), 31);    // whole of January
  assert.equal(daysLeftInCycle(new Date(2026, 1, 28, 23)), 1);   // non-leap February
});

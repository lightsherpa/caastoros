import { test } from "node:test";
import assert from "node:assert/strict";
import { computePql, TEARDOWN_EVENTS } from "./teardown-events.js";

test("event names are stable (contract for CAA-16)", () => {
  assert.equal(TEARDOWN_EVENTS.EMAIL_CAPTURED, "teardown_email_captured");
  assert.equal(TEARDOWN_EVENTS.PQL_CREATED, "teardown_pql_created");
});

test("no engagement + no clarity → cold 0", () => {
  const { pql, band } = computePql({ score: 0, engagement: {} });
  assert.equal(pql, 0);
  assert.equal(band, "cold");
});

test("gate reached on a clear brand → warm/hot, monotonic in clarity", () => {
  const low = computePql({ score: 20, engagement: { viewedReport: true, emailProvided: true } });
  const high = computePql({ score: 90, engagement: { viewedReport: true, emailProvided: true } });
  assert.ok(high.pql > low.pql, "clearer brand scores higher");
  assert.ok(high.pql >= 40 && high.pql <= 100);
});

test("full funnel engagement caps at 100 and lands hot", () => {
  const { pql, band, engagement } = computePql({
    score: 100,
    engagement: { viewedReport: true, emailProvided: true, downloadedBio: true, clickedPilot: true },
  });
  assert.equal(engagement, 100);
  assert.equal(pql, 100);
  assert.equal(band, "hot");
});

test("bands: <40 cold, 40-69 warm, >=70 hot", () => {
  assert.equal(computePql({ score: 0, engagement: { viewedReport: true } }).band, "cold");   // 15 → cold
  assert.equal(computePql({ score: 50, engagement: { viewedReport: true, emailProvided: true } }).band, "warm"); // 50 → warm
  assert.equal(computePql({ score: 100, engagement: { viewedReport: true, emailProvided: true, clickedPilot: true } }).band, "hot");
});

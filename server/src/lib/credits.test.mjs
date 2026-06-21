import { test } from "node:test";
import assert from "node:assert/strict";
import { creditBalanceFromRows, creditCheck, estimateRunCredits, monthStartIso } from "./credits.js";

test("creditBalanceFromRows treats positive ledger rows as debits and negative rows as grants", () => {
  assert.equal(creditBalanceFromRows([
    { credits: -500 },
    { credits: 80 },
    { credits: 40 },
  ]), 380);
});

test("creditCheck blocks out-of-credit requests before spend", () => {
  const out = creditCheck({ balance: 12, monthlyDebited: 0, requested: 20, runCap: 100, monthlyCap: 1000 });
  assert.equal(out.ok, false);
  assert.equal(out.code, "OUT_OF_CREDITS");
});

test("creditCheck enforces per-run and monthly caps", () => {
  assert.equal(
    creditCheck({ balance: 1000, monthlyDebited: 0, requested: 251, runCap: 250, monthlyCap: 1200 }).code,
    "RUN_CREDIT_CAP",
  );
  assert.equal(
    creditCheck({ balance: 1000, monthlyDebited: 1190, requested: 20, runCap: 250, monthlyCap: 1200 }).code,
    "MONTHLY_CREDIT_CAP",
  );
});

test("creditCheck returns the projected balance for approved requests", () => {
  const out = creditCheck({ balance: 120, monthlyDebited: 30, requested: 40, runCap: 250, monthlyCap: 1200 });
  assert.equal(out.ok, true);
  assert.equal(out.balanceAfter, 80);
});

test("estimateRunCredits keeps legacy/image runs flat and scales multi-item text deliverables", () => {
  const specPayload = { cr_estimate: 7 };
  assert.equal(estimateRunCredits({ specPayload, isDeliverableText: false }), 7);
  assert.equal(estimateRunCredits({
    specPayload,
    isDeliverableText: true,
    deliverableSpec: { count: 3, platforms: ["instagram", "linkedin"] },
  }), 42);
});

test("monthStartIso returns the UTC month boundary", () => {
  assert.equal(monthStartIso(new Date("2026-06-15T12:34:00Z")), "2026-06-01T00:00:00.000Z");
});

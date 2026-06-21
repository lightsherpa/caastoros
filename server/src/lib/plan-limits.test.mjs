import test from "node:test";
import assert from "node:assert/strict";

import {
  BRAND_LIMITS,
  brandLimit,
  canAddBrand,
  monthlyPool,
  craftEnabled,
} from "./plan-limits.js";

test("canAddBrand respects per-tier limits", () => {
  assert.equal(canAddBrand("00", 0), true);
  assert.equal(canAddBrand("00", 1), false);
  assert.equal(canAddBrand("02", 2), true);
  assert.equal(canAddBrand("02", 3), false);
  assert.equal(canAddBrand("03", 999), true);
});

test("brandLimit falls back to most restrictive for unknown tier", () => {
  assert.equal(brandLimit("xx"), 1);
});

test("brandLimit('03') is unlimited", () => {
  assert.equal(brandLimit("03"), Infinity);
});

test("BRAND_LIMITS matches the frozen contract", () => {
  assert.deepEqual(BRAND_LIMITS, { "00": 1, "01": 2, "02": 3, "03": Infinity });
});

test("monthlyPool returns the per-tier pool", () => {
  assert.equal(monthlyPool("00"), 300);
  assert.equal(monthlyPool("03"), 0);
});

test("monthlyPool falls back to The Creek for unknown tier", () => {
  assert.equal(monthlyPool("xx"), 300);
});

test("craftEnabled unlocks at The River (02) and above", () => {
  assert.equal(craftEnabled("00"), false);
  assert.equal(craftEnabled("01"), false);
  assert.equal(craftEnabled("02"), true);
  assert.equal(craftEnabled("03"), true);
  assert.equal(craftEnabled(undefined), false);
});

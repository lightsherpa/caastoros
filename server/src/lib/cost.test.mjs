import { test } from "node:test";
import assert from "node:assert/strict";
import { computeRunCostUsd, usdToCredits } from "./cost.js";

// Sonnet 5 rate rows (USD per 1M), from the pricing seed.
const SONNET5_INTRO    = { model_route: "anthropic/claude-sonnet-5", input_usd_per_m: 2, cache_read_usd_per_m: 0.2, cache_write_5m_usd_per_m: 2.5, cache_write_1h_usd_per_m: 4, output_usd_per_m: 10, batch_discount: 0.5 };
const SONNET5_STANDARD = { model_route: "anthropic/claude-sonnet-5", input_usd_per_m: 3, cache_read_usd_per_m: 0.3, cache_write_5m_usd_per_m: 3.75, cache_write_1h_usd_per_m: 6, output_usd_per_m: 15, batch_discount: 0.5 };
const FLUX             = { model_route: "vendor/fal/flux-1.1-pro", usd_per_image: 0.04 };
const RATE_MISSING     = { model_route: "openrouter/openai/gpt-5", input_usd_per_m: null, cache_read_usd_per_m: null, cache_write_5m_usd_per_m: null, cache_write_1h_usd_per_m: null, output_usd_per_m: null };

const USAGE = { input_tokens: 10_000, cache_read_tokens: 0, cache_write_5m_tokens: 0, cache_write_1h_tokens: 0, output_tokens: 2_000, batched: false };

test("acceptance: intro vs September Sonnet 5 pricing on the SAME usage yields different cost", () => {
  const intro = computeRunCostUsd({ rates: SONNET5_INTRO, usage: USAGE });
  const std   = computeRunCostUsd({ rates: SONNET5_STANDARD, usage: USAGE });
  // intro: 10k/1M*2 + 2k/1M*10 = 0.02 + 0.02 = 0.04
  assert.equal(intro, 0.04);
  // standard: 10k/1M*3 + 2k/1M*15 = 0.03 + 0.03 = 0.06
  assert.equal(std, 0.06);
  assert.notEqual(intro, std);
});

test("batch discount applies (1 - batch_discount) to token cost", () => {
  const full    = computeRunCostUsd({ rates: SONNET5_INTRO, usage: { ...USAGE, batched: false } });
  const batched = computeRunCostUsd({ rates: SONNET5_INTRO, usage: { ...USAGE, batched: true } });
  assert.equal(batched, full * 0.5);   // 0.5 discount
});

test("cache WRITES are included (the xlsx ignored them)", () => {
  const withWrite = computeRunCostUsd({
    rates: SONNET5_INTRO,
    usage: { input_tokens: 0, cache_read_tokens: 0, cache_write_5m_tokens: 8_000, cache_write_1h_tokens: 0, output_tokens: 0, batched: false },
  });
  // 8k/1M * 2.5 = 0.02 — nonzero, proving writes are priced
  assert.equal(withWrite, 0.02);
  assert.ok(withWrite > 0);
});

test("cache reads priced separately from uncached input", () => {
  const c = computeRunCostUsd({
    rates: SONNET5_INTRO,
    usage: { input_tokens: 1_000, cache_read_tokens: 9_000, cache_write_5m_tokens: 0, cache_write_1h_tokens: 0, output_tokens: 0, batched: false },
  });
  // 1k/1M*2 + 9k/1M*0.2 = 0.002 + 0.0018 = 0.0038
  assert.ok(Math.abs(c - 0.0038) < 1e-9);
});

test("image-only run priced from usd_per_image, no token rates needed", () => {
  const c = computeRunCostUsd({ rates: FLUX, usage: { batched: false }, images: 1 });
  assert.equal(c, 0.04);
  const three = computeRunCostUsd({ rates: FLUX, usage: {}, images: 3 });
  assert.equal(three, 0.12);
});

test("missing token rate throws (never silently returns 0)", () => {
  assert.throws(
    () => computeRunCostUsd({ rates: RATE_MISSING, usage: USAGE }),
    /RATE MISSING/,
  );
});

test("missing usd_per_image throws for an image run", () => {
  assert.throws(
    () => computeRunCostUsd({ rates: { model_route: "vendor/fal/gpt-image-2", usd_per_image: null }, usage: {}, images: 1 }),
    /RATE MISSING: usd_per_image/,
  );
});

test("zero usage is a legitimate $0 (not a missing-rate error)", () => {
  assert.equal(computeRunCostUsd({ rates: RATE_MISSING, usage: { batched: false } }), 0);
});

test("usdToCredits = ceil(usd / usd_per_credit)", () => {
  const policy = { usd_per_credit: 0.001 };
  assert.equal(usdToCredits(0.009, policy), 9);
  assert.equal(usdToCredits(0.0091, policy), 10);   // ceil
  assert.equal(usdToCredits(0.04, policy), 40);
  assert.equal(usdToCredits(0, policy), 0);
});

test("usdToCredits throws on bad policy or usd", () => {
  assert.throws(() => usdToCredits(0.01, { usd_per_credit: 0 }), /usd_per_credit/);
  assert.throws(() => usdToCredits(0.01, {}), /usd_per_credit/);
  assert.throws(() => usdToCredits(-1, { usd_per_credit: 0.001 }), /invalid usd/);
});

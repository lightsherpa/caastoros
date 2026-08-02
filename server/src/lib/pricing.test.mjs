import { test } from "node:test";
import assert from "node:assert/strict";
import { reconcileCost } from "./pricing.js";

// Real Anthropic-style row (Sonnet 5 intro) with a stable id.
const RATES = { id: "row-1", model_route: "anthropic/claude-sonnet-5", input_usd_per_m: 2, cache_read_usd_per_m: 0.2, cache_write_5m_usd_per_m: 2.5, cache_write_1h_usd_per_m: 4, output_usd_per_m: 10, batch_discount: 0.5 };
const RATE_MISSING = { id: "row-or", model_route: "openrouter/openai/gpt-5", input_usd_per_m: null, cache_read_usd_per_m: null, cache_write_5m_usd_per_m: null, cache_write_1h_usd_per_m: null, output_usd_per_m: null };
const POLICY = { usd_per_credit: 0.001 };
const USAGE = { input_tokens: 10_000, cache_read_tokens: 0, cache_write_5m_tokens: 0, cache_write_1h_tokens: 0, output_tokens: 2_000, batched: false };

test("computes from real rates → cost + credits + pricing_row_id", () => {
  const r = reconcileCost({ rates: RATES, policy: POLICY, usage: USAGE });
  assert.equal(r.cost_usd, 0.04);          // 10k*2/1M + 2k*10/1M
  assert.equal(r.credits, 40);             // ceil(0.04 / 0.001)
  assert.equal(r.pricing_row_id, "row-1");
  assert.equal(r.error, null);
});

test("RATE MISSING but vendor cost present → uses vendor cost, pricing_row_id null, no error", () => {
  const r = reconcileCost({ rates: RATE_MISSING, policy: POLICY, usage: USAGE, vendorCostUsd: 0.005 });
  assert.equal(r.cost_usd, 0.005);
  assert.equal(r.credits, 5);              // ceil(0.005 / 0.001)
  assert.equal(r.pricing_row_id, null);
  assert.equal(r.error, null);
});

test("no rates and no vendor cost → error, cost_usd null", () => {
  const r = reconcileCost({ rates: null, policy: POLICY, usage: USAGE });
  assert.equal(r.cost_usd, null);
  assert.equal(r.credits, null);
  assert.equal(r.pricing_row_id, null);
  assert.match(r.error, /no pricing row and no vendor cost/);
});

test("extraCostUsd (QA cost) is added before credit conversion", () => {
  const r = reconcileCost({ rates: RATES, policy: POLICY, usage: USAGE, extraCostUsd: 0.01 });
  assert.equal(r.cost_usd, 0.05);          // 0.04 + 0.01
  assert.equal(r.credits, 50);
  assert.equal(r.pricing_row_id, "row-1");
});

test("missing policy → cost recorded but credits null + error", () => {
  const r = reconcileCost({ rates: RATES, policy: null, usage: USAGE });
  assert.equal(r.cost_usd, 0.04);
  assert.equal(r.credits, null);
  assert.equal(r.pricing_row_id, "row-1");
  assert.match(r.error, /no credit_policy/);
});

// ─────────────────────────────────────────────────────────────────────
// §7 Cost engine — pure functions, no I/O.
//
// Prices one run from a resolved `pricing` row + the vendor usage object,
// and converts USD → credits via the `credit_policy`. Rate resolution
// (effective-dating) and the DB reads live in pricing.js; this module is
// deterministic and unit-tested.
//
// Supersedes the α/β/γ/δ/ε parametric math in CaastorOS_API_Cost_Model.xlsx.
// Notably: the xlsx ignored cache WRITES and undercounted — we don't.
// ─────────────────────────────────────────────────────────────────────

/** Require a per-1M rate to be present when the matching token bucket has
 *  tokens. Missing rate throws — costing must never silently return 0. */
function rateFor(tokens, ratePerM, label, route) {
  if (!tokens) return 0;                     // no tokens in this bucket → no cost, rate irrelevant
  if (ratePerM == null) {
    throw new Error(`RATE MISSING: ${label} for ${route || "route"} — pricing row has null ${label}`);
  }
  return (Number(tokens) * Number(ratePerM)) / 1_000_000;
}

/**
 * Compute a run's cost in USD.
 *
 * @param {object}  params
 * @param {object}  params.rates   - a `pricing` row: { input_usd_per_m, cache_read_usd_per_m,
 *                                    cache_write_5m_usd_per_m, cache_write_1h_usd_per_m,
 *                                    output_usd_per_m, usd_per_image, batch_discount, model_route? }
 * @param {object}  params.usage   - { input_tokens, cache_read_tokens, cache_write_5m_tokens,
 *                                    cache_write_1h_tokens, output_tokens, batched }
 * @param {number} [params.images] - image count (image models); 0 for text runs
 * @returns {number} cost in USD
 * @throws  if a needed rate is null (tokens present but no rate, or images present but no usd_per_image)
 */
export function computeRunCostUsd({ rates, usage = {}, images = 0 } = {}) {
  if (!rates) throw new Error("computeRunCostUsd: no pricing rates supplied");
  const route = rates.model_route;

  const tokenUsd =
    rateFor(usage.input_tokens,          rates.input_usd_per_m,          "input_usd_per_m",          route) +
    rateFor(usage.cache_read_tokens,     rates.cache_read_usd_per_m,     "cache_read_usd_per_m",     route) +
    rateFor(usage.cache_write_5m_tokens, rates.cache_write_5m_usd_per_m, "cache_write_5m_usd_per_m", route) +
    rateFor(usage.cache_write_1h_tokens, rates.cache_write_1h_usd_per_m, "cache_write_1h_usd_per_m", route) +
    rateFor(usage.output_tokens,         rates.output_usd_per_m,         "output_usd_per_m",         route);

  const discount = usage.batched ? Number(rates.batch_discount || 0) : 0;
  const discountedTokenUsd = tokenUsd * (1 - discount);

  let imageUsd = 0;
  if (images > 0) {
    if (rates.usd_per_image == null) {
      throw new Error(`RATE MISSING: usd_per_image for ${route || "route"} — pricing row has null usd_per_image`);
    }
    imageUsd = Number(images) * Number(rates.usd_per_image);
  }

  return discountedTokenUsd + imageUsd;
}

/**
 * Convert USD to credits per §7: credits = ceil(usd / usd_per_credit).
 * @param {number} usd
 * @param {object} policy - { usd_per_credit }
 * @returns {number} integer credits
 */
export function usdToCredits(usd, policy) {
  const perCredit = Number(policy?.usd_per_credit);
  if (!(perCredit > 0)) {
    throw new Error("usdToCredits: credit_policy.usd_per_credit missing or non-positive");
  }
  const amount = Number(usd);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`usdToCredits: invalid usd ${usd}`);
  }
  return Math.ceil(amount / perCredit);
}

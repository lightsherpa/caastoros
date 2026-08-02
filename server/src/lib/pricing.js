// ─────────────────────────────────────────────────────────────────────
// §7 Pricing — I/O layer over the `pricing` + `credit_policy` tables.
//
// cost.js is pure math; this module is where the numbers come from:
// effective-dated rate lookup (the row in force when a run started),
// the credit policy, and the run-finalization reconcile that ties them
// to cost.js. Read with the service-role client only — pricing is
// operator-facing (RLS denies anon/authenticated) per "credits only,
// never API cost".
//
// The reconcile path NEVER throws: a run must not fail because costing
// failed. On a missing/incomplete rate it falls back to the vendor's
// own reported cost (OpenRouter/fal return one); failing that it returns
// an error the caller records so it can charge the cr estimate instead.
// ─────────────────────────────────────────────────────────────────────

import { supabaseAdmin } from "./supabase.js";
import { computeRunCostUsd, usdToCredits } from "./cost.js";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Resolve the pricing row in force for a route at a moment in time:
 * latest `effective_from` <= `at`.
 * @returns {Promise<object|null>} pricing row or null
 */
export async function resolvePricingRow({ modelRoute, at }) {
  const { data } = await supabaseAdmin
    .from("pricing")
    .select("*")
    .eq("model_route", modelRoute)
    .lte("effective_from", at)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data || null;
}

/**
 * Latest credit_policy row at `at` (single source of truth for usd→credits).
 * @returns {Promise<object|null>} policy row or null
 */
export async function loadCreditPolicy({ at = new Date().toISOString() } = {}) {
  const { data } = await supabaseAdmin
    .from("credit_policy")
    .select("*")
    .lte("effective_from", at)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data || null;
}

/** Coerce a vendor-reported cost to a finite number, or null. */
function finiteOrNull(v) {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Decide cost + credits from already-resolved inputs. PURE, NEVER THROWS.
 *
 * Priority:
 *   1. compute from `rates` via cost.js (throws on a missing rate);
 *   2. on that throw — or when there is no `rates` row — fall back to the
 *      vendor-reported `vendorCostUsd` (pricing_row_id then null);
 *   3. neither available → { error }, cost_usd null.
 * `extraCostUsd` (e.g. QA-call cost) is added to the base before conversion.
 *
 * @returns {{cost_usd:number|null, credits:number|null, pricing_row_id:string|null, error:string|null}}
 */
export function reconcileCost({ rates, policy, usage = {}, images = 0, vendorCostUsd = null, extraCostUsd = 0 }) {
  let baseCost = null;
  let pricingRowId = null;
  const vendorCost = finiteOrNull(vendorCostUsd);

  if (rates) {
    try {
      baseCost = computeRunCostUsd({ rates, usage, images });
      pricingRowId = rates.id ?? null;
    } catch (err) {
      // RATE MISSING on a used bucket → prefer the vendor's own cost if we have it.
      if (vendorCost != null) baseCost = vendorCost;
      else return { cost_usd: null, credits: null, pricing_row_id: null, error: err?.message || String(err) };
    }
  } else if (vendorCost != null) {
    baseCost = vendorCost;
  } else {
    return { cost_usd: null, credits: null, pricing_row_id: null, error: `no pricing row and no vendor cost` };
  }

  const cost_usd = baseCost + (finiteOrNull(extraCostUsd) || 0);

  if (!policy) {
    return { cost_usd, credits: null, pricing_row_id: pricingRowId, error: "no credit_policy" };
  }
  try {
    return { cost_usd, credits: usdToCredits(cost_usd, policy), pricing_row_id: pricingRowId, error: null };
  } catch (err) {
    return { cost_usd, credits: null, pricing_row_id: pricingRowId, error: err?.message || String(err) };
  }
}

/**
 * Full run-finalization reconcile: resolve rate row + policy, then reconcileCost.
 * NEVER THROWS — DB read failures degrade to a null row/policy.
 * @returns {Promise<{cost_usd:number|null, credits:number|null, pricing_row_id:string|null, error:string|null}>}
 */
export async function reconcileRunCost({ route, usage, images = 0, startedAt, vendorCostUsd = null, extraCostUsd = 0 }) {
  const at = startedAt || new Date().toISOString();
  let rates = null;
  let policy = null;
  try { rates = await resolvePricingRow({ modelRoute: route, at }); } catch { rates = null; }
  try { policy = await loadCreditPolicy({ at }); } catch { policy = null; }
  return reconcileCost({ rates, policy, usage, images, vendorCostUsd, extraCostUsd });
}

/**
 * Estimate credits for a crew (§7): Σ per-specialist estimated credits.
 * Per specialist: trailing-30-day average of real run cost_usd → credits;
 * cr fallback (the hand-set spec estimate) when there's no recent data.
 * NEVER THROWS.
 * @returns {Promise<{total_credits:number, breakdown:Array<{specialistId,credits,source}>}>}
 */
export async function estimateCrewCredits({ specialistIds, at = new Date().toISOString() }) {
  const ids = Array.isArray(specialistIds) ? specialistIds.filter(Boolean) : [];
  let policy = null;
  try { policy = await loadCreditPolicy({ at }); } catch { policy = null; }
  const sinceIso = new Date(Date.parse(at) - THIRTY_DAYS_MS).toISOString();

  const breakdown = [];
  // ponytail: N+1 read over a crew (typically a handful of specialists). Correct
  // and cheap; collapse into one grouped query only if crews ever get large.
  for (const specialistId of ids) {
    let credits = null;
    let source = null;

    if (policy) {
      try {
        const { data: rows } = await supabaseAdmin
          .from("runs")
          .select("cost_usd")
          .eq("specialist_id", specialistId)
          .eq("status", "completed")
          .not("cost_usd", "is", null)
          .gte("started_at", sinceIso)
          .limit(1000);
        if (rows && rows.length) {
          const avg = rows.reduce((s, r) => s + (Number(r.cost_usd) || 0), 0) / rows.length;
          credits = usdToCredits(avg, policy);
          source = "trailing_30d_avg";
        }
      } catch { /* fall through to cr fallback */ }
    }

    if (credits == null) {
      let cr = 8;
      try {
        const { data: spec } = await supabaseAdmin
          .from("specs")
          .select("payload")
          .eq("specialist_id", specialistId)
          .eq("active", true)
          .maybeSingle();
        cr = Number(spec?.payload?.cr_estimate) || 8;
      } catch { /* keep default */ }
      credits = Math.max(1, Math.ceil(cr));
      source = "cr_fallback";
    }

    breakdown.push({ specialistId, credits, source });
  }

  const total_credits = breakdown.reduce((s, b) => s + (b.credits || 0), 0);
  return { total_credits, breakdown };
}

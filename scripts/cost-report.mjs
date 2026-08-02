// ─────────────────────────────────────────────────────────────────────
// §7 Cost telemetry report — operator-facing (USD shown; this is NOT the
// SPA, the "credits only" rule doesn't apply here). Aggregates the last
// 30 days of completed runs by specialist / department / model_route /
// vendor / brand-month, projects September Sonnet 5 repricing, and writes
// a per-run CSV. Replaces the placeholder Agents tab in
// CaastorOS_API_Cost_Model.xlsx with real telemetry.
//
// Run:  npm run cost:report
//       (node --env-file=server/.env scripts/cost-report.mjs)
// ─────────────────────────────────────────────────────────────────────

import { writeFileSync } from "node:fs";
import { supabaseAdmin } from "../server/src/lib/supabase.js";
import { computeRunCostUsd } from "../server/src/lib/cost.js";
import { resolvePricingRow } from "../server/src/lib/pricing.js";

const WINDOW_DAYS = 30;
const SONNET5_ROUTE = "anthropic/claude-sonnet-5";
const SEPT_AT = "2026-09-01T00:00:00Z";

const usd = (n) => `$${(Number(n) || 0).toFixed(4)}`;
const perCredit = (cost, cr) => (cr > 0 ? `$${(cost / cr).toFixed(6)}` : "—");

/* Sum a numeric field over rows into a Map keyed by keyFn, tracking
   run count, cost_usd and credits together. */
function aggregate(rows, keyFn) {
  const m = new Map();
  for (const r of rows) {
    const key = keyFn(r) || "unknown";
    const cur = m.get(key) || { key, runs: 0, cost_usd: 0, credits: 0 };
    cur.runs += 1;
    cur.cost_usd += Number(r.cost_usd) || 0;
    cur.credits += Number(r.credits_charged) || 0;
    m.set(key, cur);
  }
  return [...m.values()].sort((a, b) => b.cost_usd - a.cost_usd);
}

function printTable(title, agg) {
  console.log(`\n── ${title} ${"─".repeat(Math.max(0, 56 - title.length))}`);
  if (!agg.length) { console.log("  (none)"); return; }
  console.table(agg.map((a) => ({
    key: a.key,
    runs: a.runs,
    cost_usd: usd(a.cost_usd),
    credits: a.credits,
    cost_per_credit: perCredit(a.cost_usd, a.credits),
  })));
}

async function main() {
  const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString();

  const { data: runs, error } = await supabaseAdmin
    .from("runs")
    .select("id, specialist_id, model_used, cost_usd, credits_charged, usage, pricing_row_id, started_at, brief_id")
    .eq("status", "completed")
    .gte("started_at", since)
    .limit(100000);
  if (error) { console.error("runs query failed:", error.message); process.exit(1); }

  if (!runs || runs.length === 0) {
    console.log(`no completed runs in the last ${WINDOW_DAYS} days`);
    process.exit(0);
  }

  // ── Lookup maps (one query each) ────────────────────────────────────
  // department by specialist_id (latest active spec payload).
  const specialistIds = [...new Set(runs.map((r) => r.specialist_id).filter(Boolean))];
  const deptBySpecialist = new Map();
  if (specialistIds.length) {
    const { data: specs } = await supabaseAdmin
      .from("specs")
      .select("specialist_id, payload")
      .in("specialist_id", specialistIds)
      .eq("active", true);
    for (const s of specs || []) deptBySpecialist.set(s.specialist_id, s.payload?.department || "unknown");
  }

  // model_route + vendor by pricing_row_id.
  const pricingIds = [...new Set(runs.map((r) => r.pricing_row_id).filter(Boolean))];
  const pricingById = new Map();
  if (pricingIds.length) {
    const { data: prices } = await supabaseAdmin
      .from("pricing")
      .select("id, model_route, vendor")
      .in("id", pricingIds);
    for (const p of prices || []) pricingById.set(p.id, { model_route: p.model_route, vendor: p.vendor });
  }

  // brand_id + workspace_id via briefs → brands.
  const briefIds = [...new Set(runs.map((r) => r.brief_id).filter(Boolean))];
  const brandByBrief = new Map();
  const wsByBrand = new Map();
  if (briefIds.length) {
    const { data: briefs } = await supabaseAdmin
      .from("briefs").select("id, brand_id").in("id", briefIds);
    for (const b of briefs || []) brandByBrief.set(b.id, b.brand_id);
    const brandIds = [...new Set((briefs || []).map((b) => b.brand_id).filter(Boolean))];
    if (brandIds.length) {
      const { data: brands } = await supabaseAdmin
        .from("brands").select("id, workspace_id, name").in("id", brandIds);
      for (const br of brands || []) wsByBrand.set(br.id, { workspace_id: br.workspace_id, name: br.name });
    }
  }

  // Decorate each run with route/vendor/dept/brand for grouping.
  const routeOf = (r) => pricingById.get(r.pricing_row_id)?.model_route || r.model_used || "unknown";
  const vendorOf = (r) => pricingById.get(r.pricing_row_id)?.vendor || "unknown";
  const deptOf = (r) => deptBySpecialist.get(r.specialist_id) || "unknown";
  const brandOf = (r) => {
    const brandId = brandByBrief.get(r.brief_id);
    return wsByBrand.get(brandId)?.name || brandId || "unknown";
  };

  console.log(`CaastorOS cost report — ${runs.length} completed runs, last ${WINDOW_DAYS} days (since ${since.slice(0, 10)})`);

  printTable("By specialist", aggregate(runs, (r) => r.specialist_id));
  printTable("By department", aggregate(runs, deptOf));
  printTable("By model_route", aggregate(runs, routeOf));
  printTable("By vendor", aggregate(runs, vendorOf));

  // Per-brand-per-month.
  const brandMonth = aggregate(runs, (r) => `${brandOf(r)} · ${String(r.started_at).slice(0, 7)}`);
  printTable("By brand · month", brandMonth);

  // ── Projected September (reprice Sonnet 5 usage at standard rate) ────
  const sonnetStd = await resolvePricingRow({ modelRoute: SONNET5_ROUTE, at: SEPT_AT });
  const sonnetRuns = runs.filter((r) => routeOf(r) === SONNET5_ROUTE && r.usage);
  let currentSonnet = 0, projectedSonnet = 0, repriced = 0;
  for (const r of sonnetRuns) {
    currentSonnet += Number(r.cost_usd) || 0;
    if (sonnetStd) {
      try { projectedSonnet += computeRunCostUsd({ rates: sonnetStd, usage: r.usage }); repriced += 1; }
      catch { /* usage missing a bucket rate — skip */ }
    }
  }
  console.log(`\n── Projected September (Sonnet 5 standard reprice) ${"─".repeat(9)}`);
  if (!sonnetStd) {
    console.log("  no 2026-09-01 Sonnet 5 pricing row resolved — cannot project");
  } else if (repriced === 0) {
    console.log("  no Sonnet 5 runs with usage in window");
  } else {
    const delta = projectedSonnet - currentSonnet;
    console.log(`  Sonnet 5 runs repriced: ${repriced}`);
    console.log(`  current (intro):   ${usd(currentSonnet)}`);
    console.log(`  projected (Sept):  ${usd(projectedSonnet)}   (${delta >= 0 ? "+" : ""}${usd(delta)})`);
  }

  // ── Reconciliation: Σ run cost == Σ by-vendor totals ────────────────
  const totalRunCost = runs.reduce((s, r) => s + (Number(r.cost_usd) || 0), 0);
  const totalVendorCost = aggregate(runs, vendorOf).reduce((s, a) => s + a.cost_usd, 0);
  const totalCredits = runs.reduce((s, r) => s + (Number(r.credits_charged) || 0), 0);
  console.log(`\n── Reconciliation ${"─".repeat(41)}`);
  console.log(`  Σ run cost_usd:     ${usd(totalRunCost)}`);
  console.log(`  Σ by-vendor totals: ${usd(totalVendorCost)}`);
  console.log(`  Σ credits charged:  ${totalCredits}   (blended ${perCredit(totalRunCost, totalCredits)}/credit)`);
  console.log(Math.abs(totalRunCost - totalVendorCost) < 1e-6 ? "  ✓ reconciles" : "  ✗ MISMATCH — investigate");

  // ── CSV of per-run rows ─────────────────────────────────────────────
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const csvPath = `/tmp/caastor-cost-report-${stamp}.csv`;
  const esc = (v) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = ["run_id", "started_at", "specialist_id", "department", "model_route", "vendor", "brand", "cost_usd", "credits_charged"];
  const lines = [header.join(",")];
  for (const r of runs) {
    lines.push([
      r.id, r.started_at, r.specialist_id, deptOf(r), routeOf(r), vendorOf(r), brandOf(r),
      Number(r.cost_usd) || 0, Number(r.credits_charged) || 0,
    ].map(esc).join(","));
  }
  writeFileSync(csvPath, lines.join("\n") + "\n");
  console.log(`\nper-run CSV → ${csvPath}`);
}

main().catch((e) => { console.error(e?.message || e); process.exit(1); });

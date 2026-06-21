// ─────────────────────────────────────────────────────────────────────
// M5 · Brandolph memory — signal writer.
//
// Every meaningful event on a brand (run approved/flagged, output
// edited, sent to humans, re-run on premium/cheap, refusal overridden)
// is appended to `brand_signals` AND folded into the aggregate stats
// table `brand_specialist_stats`.
//
// All writes are best-effort. If the migration isn't applied yet, or
// the table is unreachable, we log and move on — the user's run
// completes regardless. M5 is observability infrastructure, not a
// blocking dependency on the run path.
// ─────────────────────────────────────────────────────────────────────

import { supabaseAdmin } from "./supabase.js";

const VALID_KINDS = new Set([
  "run.approved",
  "run.flagged",
  "run.failed",
  "run.edited",
  "output.handoff_humans",
  "output.reused",
  "refusal.override",
  "spec.rerun_with_premium",
  "spec.rerun_with_cheap",
  "spec.revision",
]);

/**
 * Append a signal event AND fold it into the per-specialist stats.
 *
 * @param {object} args
 * @param {string} args.brandId           - required
 * @param {string} args.kind              - one of VALID_KINDS
 * @param {string} [args.specialistId]    - the L2 spec, if any
 * @param {string} [args.runId]
 * @param {string} [args.outputId]
 * @param {string} [args.createdBy]       - user uuid
 * @param {object} [args.payload]         - free-form (e.g. {voice_match, brand_match, prior_model, new_model})
 */
export async function recordSignal({ brandId, kind, specialistId, runId, outputId, createdBy, payload }) {
  if (!brandId || !kind || !VALID_KINDS.has(kind)) return { ok: false, reason: "invalid args" };

  /* 1. Append-only event log. */
  try {
    await supabaseAdmin.from("brand_signals").insert({
      brand_id:      brandId,
      kind,
      specialist_id: specialistId || null,
      run_id:        runId || null,
      output_id:     outputId || null,
      created_by:    createdBy || null,
      payload:       payload || {},
    });
  } catch (e) {
    console.warn("[memory] signal insert failed (schema applied?):", e?.message || e);
  }

  /* 2. Fold into running stats. Upsert + atomic increment via
        Postgres-side math. supabase-js doesn't support arithmetic
        upsert directly, so we read-then-write inside a soft idempotent
        block. This isn't transactional — under high concurrency a
        rare lost-update can happen; nightly aggregation reconciles. */
  if (!specialistId) return { ok: true };
  try {
    const { data: existing } = await supabaseAdmin
      .from("brand_specialist_stats")
      .select("*")
      .eq("brand_id", brandId)
      .eq("specialist_id", specialistId)
      .maybeSingle();

    const row = existing || {
      brand_id: brandId, specialist_id: specialistId,
      runs_total: 0, runs_approved: 0, runs_flagged: 0, runs_failed: 0, runs_edited: 0,
      reruns_premium: 0, reruns_cheap: 0, revisions: 0, handoffs_humans: 0,
      voice_match_sum: 0, voice_match_n: 0, brand_match_sum: 0, brand_match_n: 0,
      last_run_at: null,
    };

    const next = { ...row };
    const now = new Date().toISOString();
    if (kind === "run.approved")        { next.runs_total++; next.runs_approved++; next.last_run_at = now; }
    if (kind === "run.flagged")         { next.runs_total++; next.runs_flagged++;  next.last_run_at = now; }
    if (kind === "run.failed")          { next.runs_total++; next.runs_failed++;   next.last_run_at = now; }
    if (kind === "run.edited")          { next.runs_edited++; }
    if (kind === "output.handoff_humans") { next.handoffs_humans++; }
    if (kind === "spec.rerun_with_premium") { next.reruns_premium++; }
    if (kind === "spec.rerun_with_cheap")   { next.reruns_cheap++; }
    if (kind === "spec.revision")           { next.revisions++; }

    if (typeof payload?.voice_match === "number") {
      next.voice_match_sum = Number(row.voice_match_sum) + payload.voice_match;
      next.voice_match_n   = (row.voice_match_n || 0) + 1;
    }
    if (typeof payload?.brand_match === "number") {
      next.brand_match_sum = Number(row.brand_match_sum) + payload.brand_match;
      next.brand_match_n   = (row.brand_match_n || 0) + 1;
    }

    await supabaseAdmin.from("brand_specialist_stats").upsert(next);
  } catch (e) {
    console.warn("[memory] stats upsert failed (schema applied?):", e?.message || e);
  }

  return { ok: true };
}

/* ─────────────────────────────────────────────────────────────────
   Memory READER — produces the short string that gets injected into
   the Sharpener's system prompt. Brandolph stops proposing blindly
   and starts recommending what has actually worked for THIS brand.

   Three buckets surfaced to the prompt:
     1. Top performers   — high approval + good QA scores
     2. Watch list       — frequently edited, flagged, or escalated
     3. Cost-tuning      — patterns from re-runs (operator keeps
                            escalating spec X → prefer premium model)

   The string is bounded so it never exceeds ~600 tokens regardless
   of how many specialists a brand has signal on. */
export async function loadBrandMemorySummary(brandId, { agentNames } = {}) {
  if (!brandId) return "";

  const { data: stats } = await supabaseAdmin
    .from("brand_specialist_stats_view")
    .select("*")
    .eq("brand_id", brandId);
  if (!stats || stats.length === 0) return "";

  /* Look up recent re-run signals (last 30 days, premium-up + cheap-down) */
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: rerunSignals } = await supabaseAdmin
    .from("brand_signals")
    .select("specialist_id, kind, payload")
    .eq("brand_id", brandId)
    .in("kind", ["spec.rerun_with_premium", "spec.rerun_with_cheap"])
    .gte("created_at", since);

  /* Aggregate re-run counts by spec to surface "consistently escalated" patterns */
  const rerunMap = new Map(); // specId -> { up, down, toModel }
  for (const s of (rerunSignals || [])) {
    const k = s.specialist_id;
    if (!k) continue;
    if (!rerunMap.has(k)) rerunMap.set(k, { up: 0, down: 0, toModel: null });
    const r = rerunMap.get(k);
    if (s.kind === "spec.rerun_with_premium") { r.up++; r.toModel = s.payload?.to || r.toModel; }
    if (s.kind === "spec.rerun_with_cheap")   { r.down++; }
  }

  const minRuns = 3;                                // ignore single-run noise
  const named = (id) => agentNames?.[id] || id;

  /* Top performers: ≥80% approval AND avg voice/brand >= 75 AND >=minRuns runs. */
  const top = stats
    .filter((r) => (r.runs_total || 0) >= minRuns)
    .filter((r) => (r.approval_pct ?? 0) >= 80)
    .filter((r) => (r.avg_voice_match ?? r.avg_brand_match ?? 0) >= 75)
    .sort((a, b) => (b.approval_pct - a.approval_pct))
    .slice(0, 6);

  /* Watch list: high edit rate OR multiple flags. */
  const watch = stats
    .filter((r) => (r.runs_total || 0) >= minRuns)
    .filter((r) => {
      const editRate = r.runs_total > 0 ? r.runs_edited / r.runs_total : 0;
      return r.runs_flagged >= 2 || editRate >= 0.4 || (r.avg_voice_match ?? r.avg_brand_match ?? 100) < 65;
    })
    .sort((a, b) => (b.runs_flagged - a.runs_flagged) || (b.runs_edited - a.runs_edited))
    .slice(0, 5);

  /* Cost-tuning: ≥3 escalations to premium with no offsetting cheap re-runs. */
  const escalate = [];
  for (const [id, r] of rerunMap.entries()) {
    if (r.up >= 3 && r.up > r.down) {
      escalate.push({ id, up: r.up, down: r.down, toModel: r.toModel });
    }
  }
  escalate.sort((a, b) => b.up - a.up);

  if (top.length === 0 && watch.length === 0 && escalate.length === 0) return "";

  const lines = [];
  lines.push(`## WHAT THIS BRAND'S MEMORY SAYS — use this when proposing specialists`);
  lines.push(``);

  if (top.length) {
    lines.push(`Specialists that ship consistently for this brand:`);
    for (const r of top) {
      const score = r.avg_voice_match ?? r.avg_brand_match ?? 0;
      lines.push(`- ${r.specialist_id} ${named(r.specialist_id)} · ${r.approval_pct}% approved · QA ${score} · ${r.runs_total} runs`);
    }
    lines.push(``);
  }

  if (watch.length) {
    lines.push(`Specialists where this brand's output needs attention (high edits / flags / low QA):`);
    for (const r of watch) {
      const editRate = r.runs_total > 0 ? Math.round(100 * r.runs_edited / r.runs_total) : 0;
      lines.push(`- ${r.specialist_id} ${named(r.specialist_id)} · ${r.runs_flagged} flagged · ${editRate}% edited · ${r.runs_total} runs`);
    }
    lines.push(``);
  }

  if (escalate.length) {
    lines.push(`Operator pattern: keeps re-running these on premium models. Favor a premium model in the spec proposal:`);
    for (const e of escalate) {
      const m = (e.toModel || "").split("/").slice(-1)[0];
      lines.push(`- ${e.id} ${named(e.id)} · escalated ${e.up}× → ${m}`);
    }
    lines.push(``);
  }

  lines.push(`Recommend specialists that have actually shipped for THIS brand. If a strong performer fits the brief, propose it. If a watch-list spec is needed, propose it anyway but flag the concern in your tension line.`);

  return lines.join("\n");
}

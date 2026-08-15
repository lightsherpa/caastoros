import { monthlyPool } from "./plan-limits.js";
import { supabaseAdmin } from "./supabase.js";

export const DEFAULT_RUN_CREDIT_CAP = 250;
export const DEFAULT_MONTHLY_DEBIT_CAP = 1200;

function envInt(name, fallback) {
  const raw = process.env[name];
  if (raw == null || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

export function creditBalanceFromRows(rows = []) {
  return -(rows || []).reduce((sum, row) => sum + (Number(row.credits) || 0), 0);
}

export function monthStartIso(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

export function monthlyDebitedFromRows(rows = [], now = new Date()) {
  const start = Date.parse(monthStartIso(now));
  const refundedRuns = new Set(
    (rows || [])
      .filter((row) => Number(row.credits) < 0 && /refund/i.test(String(row.kind || "")) && row.run_id)
      .map((row) => row.run_id),
  );
  return (rows || []).reduce((sum, row) => {
    const credits = Number(row.credits) || 0;
    const at = Date.parse(row.created_at || 0);
    const refunded = row.run_id && refundedRuns.has(row.run_id);
    return credits > 0 && at >= start && !refunded ? sum + credits : sum;
  }, 0);
}

export function estimateRunCredits({ specPayload, deliverableSpec, isDeliverableText = false }) {
  const base = Math.max(1, Math.ceil(Number(specPayload?.cr_estimate) || 8));
  if (!isDeliverableText) return base;

  const count = Math.max(1, Math.ceil(Number(deliverableSpec?.count) || 1));
  const platforms = Array.isArray(deliverableSpec?.platforms)
    ? deliverableSpec.platforms.length
    : (deliverableSpec?.platform ? 1 : 1);
  return base * count * Math.max(1, platforms);
}

export function creditCheck({ balance, monthlyDebited, requested, runCap, monthlyCap }) {
  const amount = Math.max(0, Math.ceil(Number(requested) || 0));
  if (runCap > 0 && amount > runCap) {
    return { ok: false, code: "RUN_CREDIT_CAP", message: `This run exceeds the ${runCap} credit per-run cap.` };
  }
  if (monthlyCap > 0 && monthlyDebited + amount > monthlyCap) {
    return { ok: false, code: "MONTHLY_CREDIT_CAP", message: "This workspace has reached its monthly credit cap." };
  }
  if (balance < amount) {
    return { ok: false, code: "OUT_OF_CREDITS", message: "Out of credits. Top up before running this." };
  }
  return { ok: true, requested: amount, balanceAfter: balance - amount };
}

export async function loadCreditState(workspaceId, { now = new Date() } = {}) {
  // ponytail: reads the workspace's full ledger and sums client-side. Correct
  // and cheap to tens of thousands of rows (well beyond any real workspace);
  // if a ledger ever gets huge, move the SUM into Postgres via an RPC/view.
  const { data: rows, error } = await supabaseAdmin
    .from("ledger")
    .select("credits, kind, run_id, created_at")
    .eq("workspace_id", workspaceId)
    .limit(50000);
  if (error) throw new Error(`credit ledger read failed: ${error.message}`);

  const balance = creditBalanceFromRows(rows);
  const monthlyDebited = monthlyDebitedFromRows(rows, now);

  return { balance, monthlyDebited };
}

export async function assertCreditsAvailable(workspaceId, requested, options = {}) {
  const state = await loadCreditState(workspaceId, options);
  const runCap = options.runCap ?? envInt("MAX_RUN_CREDITS", DEFAULT_RUN_CREDIT_CAP);
  // Monthly cap is a per-tier entitlement now: resolved from the workspace's tier pool.
  // The MAX_MONTHLY_DEBIT_CREDITS env (and DEFAULT_MONTHLY_DEBIT_CAP) is superseded — the
  // tier pool is the source of truth. monthlyPool(tier) === 0 means unlimited (The Colony):
  // creditCheck only treats `monthlyCap > 0` as an active cap, so 0 = no monthly cap.
  const { data: ws } = await supabaseAdmin.from("workspaces").select("tier").eq("id", workspaceId).maybeSingle();
  const tier = ws?.tier || "00";
  const monthlyCap = options.monthlyCap ?? monthlyPool(tier);
  const result = creditCheck({ ...state, requested, runCap, monthlyCap });
  return { ...result, ...state, requested: Math.max(0, Math.ceil(Number(requested) || 0)), runCap, monthlyCap };
}

/* Atomic credit reservation. The Postgres function locks the workspace row,
   re-checks the live ledger balance/monthly cap, and writes the debit in the
   same transaction. Use this immediately before external model work. */
export async function reserveCredits({ workspaceId, amount, key, kind = "reservation", runId = null }) {
  const { data, error } = await supabaseAdmin.rpc("reserve_workspace_credits", {
    p_workspace_id: workspaceId,
    p_amount: Math.max(1, Math.ceil(Number(amount) || 0)),
    p_idempotency_key: key,
    p_kind: kind,
    p_run_id: runId,
  });
  if (error) {
    const message = error.message || "Credit reservation failed";
    const code = message.includes("OUT_OF_CREDITS") ? "OUT_OF_CREDITS"
      : message.includes("MONTHLY_CREDIT_CAP") ? "MONTHLY_CREDIT_CAP"
      : "CREDIT_RESERVATION_FAILED";
    return { ok: false, code, message };
  }
  return { ok: true, ...(data || {}) };
}

/* Idempotent compensating credit for a run that failed after reservation. */
export async function releaseCredits({ workspaceId, reservationKey, releaseKey, reason = "run_refund" }) {
  const { data, error } = await supabaseAdmin.rpc("release_workspace_credits", {
    p_workspace_id: workspaceId,
    p_reservation_key: reservationKey,
    p_release_key: releaseKey,
    p_reason: reason,
  });
  if (error) throw new Error(`credit release failed: ${error.message}`);
  return data;
}

/* Atomically marks a run failed and compensates its reservation. */
export async function failRunAndReleaseCredits({ workspaceId, runId, reservationKey, releaseKey, reason = "run_refund" }) {
  const { data, error } = await supabaseAdmin.rpc("fail_run_and_release_credits", {
    p_workspace_id: workspaceId,
    p_run_id: runId,
    p_reservation_key: reservationKey,
    p_release_key: releaseKey,
    p_reason: reason,
  });
  if (error) throw new Error(`failed run settlement failed: ${error.message}`);
  return data;
}

export function creditErrorResponse(c, check) {
  const status = check.code === "OUT_OF_CREDITS" ? 402 : 429;
  return c.json({
    error: check.message,
    code: check.code,
    credits_required: check.requested,
    balance: check.balance,
    monthly_debited: check.monthlyDebited,
  }, status);
}

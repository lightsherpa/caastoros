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
  const { data: rows, error } = await supabaseAdmin
    .from("ledger")
    .select("credits, created_at")
    .eq("workspace_id", workspaceId);
  if (error) throw new Error(`credit ledger read failed: ${error.message}`);

  const balance = creditBalanceFromRows(rows);
  const start = Date.parse(monthStartIso(now));
  const monthlyDebited = (rows || []).reduce((sum, row) => {
    const credits = Number(row.credits) || 0;
    const at = Date.parse(row.created_at || 0);
    return credits > 0 && at >= start ? sum + credits : sum;
  }, 0);

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

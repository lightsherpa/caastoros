import { Hono } from "hono";
import { requireAuth } from "../middleware/auth.js";
import { supabaseAdmin } from "../lib/supabase.js";
import { loadCreditState, monthStartIso, summarizeCreditUsage } from "../lib/credits.js";
import { monthlyPool } from "../lib/plan-limits.js";
import { canAccessWorkspace } from "../lib/permissions.js";

const app = new Hono();

/* GET /api/credits — live balance + monthly pool for the signed-in workspace.
   Balance is derived from the ledger (credits.js); monthly is the tier pool
   (0 = unlimited, The Colony). This is the source the SPA credits widget
   hydrates from — the server already enforces these numbers on every run. */
app.get("/", requireAuth, async (c) => {
  const auth = c.get("auth");
  const requestedWorkspaceId = c.req.query("workspaceId") || null;
  const workspaceId = requestedWorkspaceId || auth.workspaceId
    || auth.memberships?.[0]?.workspace_id || auth.assignments?.[0]?.workspace_id || null;
  if (!workspaceId || !canAccessWorkspace(auth, workspaceId)) return c.json({ error:"Workspace access required" }, 403);
  const { data: ws } = await supabaseAdmin
    .from("workspaces")
    .select("tier")
    .eq("id", workspaceId)
    .maybeSingle();
  const tier = ws?.tier || "00";
  const { balance, monthlyDebited } = await loadCreditState(workspaceId);
  const { data: ledgerRows, error: ledgerError } = await supabaseAdmin
    .from("ledger")
    .select("id,run_id,credits,kind,balance_after,created_at")
    .eq("workspace_id", workspaceId)
    .gte("created_at", monthStartIso())
    .order("created_at", { ascending:false })
    .limit(1000);
  if (ledgerError) return c.json({ error:"Could not load credit usage" }, 500);

  const runIds = [...new Set((ledgerRows || []).map((row) => row.run_id).filter(Boolean))];
  let runsById = new Map();
  if (runIds.length) {
    const { data: runs } = await supabaseAdmin
      .from("runs")
      .select("id,specialist_id,brief:briefs(id,title,brand:brands(id,name))")
      .in("id", runIds);
    runsById = new Map((runs || []).map((run) => [run.id, run]));
  }

  const labelForKind = (kind) => String(kind || "Credit activity")
    .replaceAll("_", " ")
    .replaceAll(".", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
  const recent = (ledgerRows || []).slice(0, 20).map((row) => {
    const run = row.run_id ? runsById.get(row.run_id) : null;
    const briefTitle = run?.brief?.title || null;
    return {
      id: row.id,
      credits: Number(row.credits) || 0,
      kind: row.kind,
      category: summarizeCreditUsage([row], new Date(row.created_at))?.[0]?.category || "Other usage",
      description: briefTitle ? `${briefTitle} · ${run.specialist_id || "Specialist"}` : labelForKind(row.kind),
      brand: run?.brief?.brand?.name || null,
      balanceAfter: row.balance_after,
      createdAt: row.created_at,
    };
  });

  return c.json({
    balance,
    monthly: monthlyPool(tier),
    monthlyDebited,
    tier,
    usage: {
      categories: summarizeCreditUsage(ledgerRows || []),
      recent,
    },
  });
});

export default app;

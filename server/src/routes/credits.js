import { Hono } from "hono";
import { requireAuth } from "../middleware/auth.js";
import { supabaseAdmin } from "../lib/supabase.js";
import { loadCreditState } from "../lib/credits.js";
import { monthlyPool } from "../lib/plan-limits.js";

const app = new Hono();

/* GET /api/credits — live balance + monthly pool for the signed-in workspace.
   Balance is derived from the ledger (credits.js); monthly is the tier pool
   (0 = unlimited, The Colony). This is the source the SPA credits widget
   hydrates from — the server already enforces these numbers on every run. */
app.get("/", requireAuth, async (c) => {
  const { workspaceId } = c.get("auth");
  const { data: ws } = await supabaseAdmin
    .from("workspaces")
    .select("tier")
    .eq("id", workspaceId)
    .maybeSingle();
  const tier = ws?.tier || "00";
  const { balance, monthlyDebited } = await loadCreditState(workspaceId);
  return c.json({ balance, monthly: monthlyPool(tier), monthlyDebited, tier });
});

export default app;

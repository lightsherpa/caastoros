// Brands route — create a brand within the caller's workspace, gated by tier.
// SPA hits POST /api/brands with { name }.

import { Hono } from "hono";
import { requireAuth } from "../middleware/auth.js";
import { supabaseAdmin } from "../lib/supabase.js";
import { brandLimit } from "../lib/plan-limits.js";

const app = new Hono();

/* POST /api/brands
   Body: { name }
   Returns: { brand: { id, name, created_at } }
   Enforces the per-tier brand limit (plan-limits.js). When the workspace
   has reached its tier cap, returns 402 BRAND_LIMIT with the tier, limit,
   and current count so the SPA can prompt an upgrade.                    */
app.post("/", requireAuth, async (c) => {
  const { workspaceId } = c.get("auth");
  const body = await c.req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return c.json({ error: "name required" }, 400);

  // Resolve tier for the structured limit response. The actual count + insert
  // happens atomically in Postgres under a workspace row lock.
  const { data: workspace } = await supabaseAdmin
    .from("workspaces").select("tier").eq("id", workspaceId).maybeSingle();
  const tier = workspace?.tier || "00";

  const { data, error } = await supabaseAdmin.rpc("create_brand_with_limit", {
    p_workspace_id: workspaceId,
    p_name: name,
  });
  if (error) {
    if ((error.message || "").includes("BRAND_LIMIT")) {
      const { count } = await supabaseAdmin.from("brands")
        .select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId);
      return c.json({ error: "BRAND_LIMIT", tier, limit: brandLimit(tier), count }, 402);
    }
    return c.json({ error: error.message }, 500);
  }

  return c.json({ brand: data });
});

export default app;

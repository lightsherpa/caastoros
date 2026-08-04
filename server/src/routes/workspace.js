// Workspace route — read-only surface for the Settings page.

import { Hono } from "hono";
import { requireAuth } from "../middleware/auth.js";
import { supabaseAdmin } from "../lib/supabase.js";

const app = new Hono();

/* GET /api/workspace/members
   Everyone in the caller's workspace, in join order. Needs the admin client:
   `users` RLS is self-read only, so the browser client would only ever see
   the signed-in user. */
app.get("/members", requireAuth, async (c) => {
  const { workspaceId } = c.get("auth");
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id, email, role")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ members: data || [] });
});

export default app;

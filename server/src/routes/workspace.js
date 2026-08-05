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

/* DELETE /api/workspace
   Body: { confirmName }
   Destroys the caller's workspace. Every content table cascades from
   `workspaces` (brands -> bios/briefs/runs/outputs, ledger, uploads), so
   one delete removes it all.

   Two guards, both server-side because a client-side gate protects
   nothing:
   1. confirmName must equal the workspace name — the UI asks the user to
      type it, and the server insists on it too.
   2. Refuse while other members remain. Deleting cascades `users`, which
      would silently strip colleagues of their account and leave their
      auth row orphaned (the signup trigger only fires on INSERT, so they
      could never sign in again). One person must not be able to do that
      to a team from a settings page.

   The caller's own auth user is deleted last: without it they would keep
   a valid session pointing at a users row that no longer exists. */
app.delete("/", requireAuth, async (c) => {
  const { workspaceId, userId } = c.get("auth");
  const body = await c.req.json().catch(() => ({}));

  const { data: ws, error: wsErr } = await supabaseAdmin
    .from("workspaces").select("id, name").eq("id", workspaceId).maybeSingle();
  if (wsErr) return c.json({ error: wsErr.message }, 500);
  if (!ws) return c.json({ error: "Workspace not found" }, 404);

  if (String(body?.confirmName || "").trim() !== (ws.name || "")) {
    return c.json({ error: "Workspace name did not match" }, 400);
  }

  const { data: members, error: memErr } = await supabaseAdmin
    .from("users").select("id").eq("workspace_id", workspaceId);
  if (memErr) return c.json({ error: memErr.message }, 500);
  if ((members || []).length > 1) {
    return c.json({ error: "Remove the other members before deleting this workspace." }, 409);
  }

  const { error: delErr } = await supabaseAdmin.from("workspaces").delete().eq("id", workspaceId);
  if (delErr) return c.json({ error: delErr.message }, 500);

  /* Best-effort: the workspace is already gone, so a failure here leaves
     an orphaned auth row rather than a half-deleted workspace. Logged, not
     surfaced — the destructive part succeeded. */
  try {
    await supabaseAdmin.auth.admin.deleteUser(userId);
  } catch (e) {
    console.warn("[workspace DELETE] auth user cleanup failed:", e?.message || e);
  }

  return c.json({ ok: true, deleted: workspaceId });
});

export default app;

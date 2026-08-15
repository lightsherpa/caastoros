import { Hono } from "hono";
import { requireAuth } from "../middleware/auth.js";
import { supabaseAdmin } from "../lib/supabase.js";

const app = new Hono();

/* GET /api/notifications — the caller's 50 most recent + unread count.
   (Realtime pushes new rows live; this is the initial load + backfill.) */
app.get("/", requireAuth, async (c) => {
  const { userId } = c.get("auth");
  const [itemsResult, countResult] = await Promise.all([
    supabaseAdmin.from("notifications")
      .select("id, kind, title, body, link, brand_id, read_at, created_at")
      .eq("user_id", userId).order("created_at", { ascending: false }).limit(50),
    supabaseAdmin.from("notifications")
      .select("id", { count: "exact", head: true }).eq("user_id", userId).is("read_at", null),
  ]);
  if (itemsResult.error || countResult.error) {
    return c.json({ error: itemsResult.error?.message || countResult.error?.message }, 500);
  }
  const { data } = itemsResult;
  const items = data || [];
  return c.json({ items, unread: countResult.count || 0 });
});

/* GET /api/notifications/prefs — per-channel toggles (default on). */
app.get("/prefs", requireAuth, async (c) => {
  const { userId } = c.get("auth");
  const { data } = await supabaseAdmin
    .from("notification_prefs").select("in_app, email").eq("user_id", userId).maybeSingle();
  return c.json({ in_app: data?.in_app ?? true, email: data?.email ?? true });
});

/* PATCH /api/notifications/prefs { in_app?, email? } */
app.patch("/prefs", requireAuth, async (c) => {
  const { userId } = c.get("auth");
  const body = await c.req.json().catch(() => ({}));
  const row = { user_id: userId, updated_at: new Date().toISOString() };
  if (typeof body.in_app === "boolean") row.in_app = body.in_app;
  if (typeof body.email === "boolean") row.email = body.email;
  const { error } = await supabaseAdmin.from("notification_prefs").upsert(row, { onConflict: "user_id" });
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ ok: true });
});

/* POST /api/notifications/read-all */
app.post("/read-all", requireAuth, async (c) => {
  const { userId } = c.get("auth");
  await supabaseAdmin
    .from("notifications").update({ read_at: new Date().toISOString() })
    .eq("user_id", userId).is("read_at", null);
  return c.json({ ok: true });
});

/* PATCH /api/notifications/:id/read */
app.patch("/:id/read", requireAuth, async (c) => {
  const { userId } = c.get("auth");
  await supabaseAdmin
    .from("notifications").update({ read_at: new Date().toISOString() })
    .eq("id", c.req.param("id")).eq("user_id", userId);
  return c.json({ ok: true });
});

export default app;

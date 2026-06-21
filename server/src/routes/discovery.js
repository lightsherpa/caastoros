// Discovery route — fires the compile-bio Inngest event.
// SPA hits POST /api/discovery/start with { url, brandId? }.

import { Hono } from "hono";
import { requireAuth } from "../middleware/auth.js";
import { supabaseAdmin } from "../lib/supabase.js";
import { inngest } from "../lib/inngest.js";

const app = new Hono();

/* POST /api/discovery/start
   Body: { url, brandId? }
   Returns: { eventId, brandId, url }
   The actual scrape + BIO synthesis runs async in the compile-bio
   Inngest function (server/src/inngest/functions/compile-bio.js).
   Poll GET /api/bios/:brandId or subscribe via Supabase Realtime to
   see the new BIO row land.                                            */
app.post("/start", requireAuth, async (c) => {
  const { workspaceId } = c.get("auth");
  const body = await c.req.json().catch(() => ({}));
  const url = typeof body.url === "string" ? body.url.trim() : "";
  const instagram = typeof body.instagram === "string" ? body.instagram.trim() : undefined;
  if (!url) return c.json({ error: "url required" }, 400);

  // Resolve brand — either the caller-supplied id (with workspace check)
  // or the workspace's default (first) brand.
  let brandId = body.brandId;
  if (brandId) {
    const { data: brand } = await supabaseAdmin
      .from("brands").select("id, workspace_id").eq("id", brandId).maybeSingle();
    if (!brand || brand.workspace_id !== workspaceId) return c.json({ error: "Brand not in workspace" }, 403);
  } else {
    const { data: brand } = await supabaseAdmin
      .from("brands").select("id").eq("workspace_id", workspaceId)
      .order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (!brand) return c.json({ error: "No brand in workspace yet" }, 400);
    brandId = brand.id;
  }

  // Update brand.url if it differs (so future discoveries can default to it)
  await supabaseAdmin.from("brands").update({ url }).eq("id", brandId);

  // Fire the event — compile-bio function picks it up asynchronously.
  // If the queue is unreachable (e.g. Inngest dev server not running in
  // local dev), surface a clear 503 instead of a bare 500.
  let ids;
  try {
    ({ ids } = await inngest.send({
      name: "discovery/start",
      data: { brandId, url, workspaceId, instagram },
    }));
  } catch (err) {
    console.error("[discovery] inngest.send failed:", err?.message || err);
    return c.json({ error: "Discovery queue unavailable — try again shortly" }, 503);
  }

  return c.json({ eventId: ids?.[0] || null, brandId, url, status: "queued" });
});

export default app;

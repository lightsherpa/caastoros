// Admin-only routes — specs editor for now. Mounted at /api/admin.
//
// Every endpoint requires both requireAuth and requireAdmin. The admin
// role is enforced by `users.role = 'admin'` (CHECK constraint already
// allows 'admin' since migration 20260524183348_init).
//
// Spec editing model:
//   • Specs are version-tracked. Editing creates a NEW row at version+1
//     so prior runs (which reference spec_version) keep their lineage.
//   • The old row stays in the DB; `active` is moved to the new row.
//   • Concurrent edits race — last writer wins, but version bumps so
//     conflict shows up as a stale `current_version` on the next GET.

import { Hono } from "hono";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { supabaseAdmin } from "../lib/supabase.js";

const app = new Hono();
app.use("*", requireAuth, requireAdmin);

/* GET /api/admin/specs
   Lists every spec at its current (latest) version — across all
   specialists, including internal ones (BIO Compiler, Audit). */
app.get("/specs", async (c) => {
  const { data, error } = await supabaseAdmin
    .from("specs")
    .select("id, specialist_id, version, active, payload, created_at")
    .order("specialist_id", { ascending: true })
    .order("version", { ascending: false });
  if (error) return c.json({ error: error.message }, 500);

  // Collapse to latest version per specialist_id
  const seen = new Set();
  const latest = (data || []).filter((row) => {
    if (seen.has(row.specialist_id)) return false;
    seen.add(row.specialist_id);
    return true;
  });
  return c.json({ specs: latest });
});

/* GET /api/admin/specs/:specialistId
   Full history for one specialist (every version). */
app.get("/specs/:specialistId", async (c) => {
  const sid = c.req.param("specialistId");
  const { data, error } = await supabaseAdmin
    .from("specs")
    .select("id, specialist_id, version, active, payload, created_at")
    .eq("specialist_id", sid)
    .order("version", { ascending: false });
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ history: data || [] });
});

/* PATCH /api/admin/specs/:specialistId
   Creates a new row at version+1 with the merged payload. Switches
   `active=true` to the new row, `active=false` on the prior row.
   Body: { payload: {...partial spec fields...} } — merged onto current. */
app.patch("/specs/:specialistId", async (c) => {
  const sid = c.req.param("specialistId");
  let body;
  try { body = await c.req.json(); } catch { return c.json({ error: "Invalid JSON" }, 400); }
  const patch = body?.payload;
  if (!patch || typeof patch !== "object") {
    return c.json({ error: "payload object required" }, 400);
  }

  const { data: inserted, error } = await supabaseAdmin.rpc("switch_active_spec_version", {
    p_specialist_id: sid,
    p_payload: patch,
  });
  if (error) {
    const status = (error.message || "").includes("SPEC_NOT_FOUND") ? 404 : 500;
    return c.json({ error: error.message }, status);
  }
  return c.json({ spec: inserted, prior_version: Number(inserted.version) - 1 });
});

/* GET /api/admin/brandolph/brands
   List of brands the admin can introspect memory for. */
app.get("/brandolph/brands", async (c) => {
  const { data, error } = await supabaseAdmin
    .from("brands").select("id, name, workspace_id, created_at")
    .order("name", { ascending: true });
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ brands: data || [] });
});

/* GET /api/admin/brandolph/:brandId/memory
   Per-brand memory rollup: aggregated stats + recent signals. */
app.get("/brandolph/:brandId/memory", async (c) => {
  const brandId = c.req.param("brandId");
  const [statsRes, signalsRes] = await Promise.all([
    supabaseAdmin.from("brand_specialist_stats_view").select("*").eq("brand_id", brandId),
    supabaseAdmin
      .from("brand_signals")
      .select("id, kind, specialist_id, run_id, output_id, payload, created_at, created_by")
      .eq("brand_id", brandId)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  /* If the migration hasn't been applied yet, both queries return an
     error about a missing relation — present that explicitly so the
     admin knows to apply the SQL, vs a generic 500. */
  const stats = statsRes.data || [];
  const signals = signalsRes.data || [];
  const migrationApplied = !(statsRes.error?.code === "42P01" || signalsRes.error?.code === "42P01");

  return c.json({
    brandId,
    migrationApplied,
    stats,
    signals,
    statsError:   statsRes.error?.message || null,
    signalsError: signalsRes.error?.message || null,
  });
});

/* POST /api/admin/specs/:specialistId/activate
   Body: { version }. Sets one historical version as the active one
   (rolls back, in effect). */
app.post("/specs/:specialistId/activate", async (c) => {
  const sid = c.req.param("specialistId");
  let body;
  try { body = await c.req.json(); } catch { return c.json({ error: "Invalid JSON" }, 400); }
  const version = Number(body?.version);
  if (!Number.isFinite(version)) return c.json({ error: "version required" }, 400);

  const { data: target } = await supabaseAdmin
    .from("specs").select("id").eq("specialist_id", sid).eq("version", version).maybeSingle();
  if (!target) return c.json({ error: "Version not found" }, 404);

  // Deactivate all other versions
  await supabaseAdmin.from("specs").update({ active: false }).eq("specialist_id", sid);
  // Activate the requested one
  await supabaseAdmin.from("specs").update({ active: true }).eq("id", target.id);

  return c.json({ activated: { specialist_id: sid, version } });
});

export default app;

import { Hono } from "hono";
import { streamSSE } from "hono/streaming";

import { buildBrandolphSystem } from "../prompt.js";
import { streamCompletion, BRANDOLPH_SYNTHETIC_SPEC, isRouteAvailable } from "../lib/models/router.js";
import { loadBrandBio } from "../lib/load-brand-bio.js";
import { requireAuth } from "../middleware/auth.js";
import { supabaseAdmin } from "../lib/supabase.js";

const app = new Hono();

/* POST /api/brandolph/ask
   Body: { messages, routeId?, brandId? }
   Auth: required (Bearer JWT from Supabase magic-link or password sign-in)
   SSE events: token | done (normalized usage) | error

   The brand + BIO now come from Supabase (loadBrandBio). If the
   user's brand has no BIO yet, the loader falls back to the Vinilo
   seed so the endpoint still works pre-P1 Discovery. Once P1.5
   Steward lands, set requireCertified=true here.                       */
app.post("/ask", requireAuth, async (c) => {
  const route = BRANDOLPH_SYNTHETIC_SPEC.payload.modelRouting.primary;
  if (!isRouteAvailable(route)) {
    return c.json({ error: `Server has no API key for route ${route}.` }, 503);
  }

  let body;
  try { body = await c.req.json(); } catch { return c.json({ error: "Invalid JSON body." }, 400); }

  const messages = Array.isArray(body?.messages) ? body.messages : [];
  if (messages.length === 0) return c.json({ error: "messages[] required." }, 400);

  const { workspaceId } = c.get("auth");
  const routeId = typeof body?.routeId === "string" ? body.routeId : null;
  const brandId = typeof body?.brandId === "string" ? body.brandId : null;

  /* Read-only Brandolph Q&A is allowed before certification — it just needs
     a BIO to read (latest version, certified or not). It never falls back to
     the fictional seed; a brand with no BIO gets a clear NO_BIO. */
  let brandBio;
  try {
    brandBio = await loadBrandBio({ workspaceId, brandId });
  } catch (err) {
    if (err.code === "NO_BIO") {
      return c.json({ error: "This brand has no BIO yet — run Discovery to create one.", code: err.code }, 409);
    }
    return c.json({ error: err.message || String(err) }, 400);
  }

  const system = buildBrandolphSystem({
    brand:    brandBio.brand,
    bio:      brandBio.bio,
    refusals: brandBio.refusals,
    routeId,
  });

  return streamSSE(c, async (stream) => {
    for await (const ev of streamCompletion({ spec: BRANDOLPH_SYNTHETIC_SPEC, system, messages })) {
      if (ev.type === "token") {
        await stream.writeSSE({ event: "token", data: JSON.stringify({ text: ev.text }) });
      } else if (ev.type === "done") {
        await stream.writeSSE({ event: "done", data: JSON.stringify({ stopReason: ev.stopReason, usage: ev.usage }) });
      } else if (ev.type === "error") {
        await stream.writeSSE({ event: "error", data: JSON.stringify({ message: ev.message }) });
      }
    }
  });
});

/* GET /api/brandolph/memory?brandId=...
   Lightweight memory snapshot for the floater. RLS scopes to brands
   the user can see (workspace_id match). Used by FloatingBrandolph
   to derive a context-aware greeting on each route — no LLM cost. */
app.get("/memory", requireAuth, async (c) => {
  const { workspaceId } = c.get("auth");
  const brandId = c.req.query("brandId");
  if (!brandId) return c.json({ error: "brandId required" }, 400);

  /* Workspace check — defense in depth on top of RLS */
  const { data: brand } = await supabaseAdmin
    .from("brands").select("id, workspace_id, name")
    .eq("id", brandId).maybeSingle();
  if (!brand || brand.workspace_id !== workspaceId) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const [statsRes, signalsRes] = await Promise.all([
    supabaseAdmin.from("brand_specialist_stats_view").select("*").eq("brand_id", brandId),
    supabaseAdmin
      .from("brand_signals")
      .select("kind, specialist_id, payload, created_at")
      .eq("brand_id", brandId)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const migrationApplied = !(statsRes.error?.code === "42P01" || signalsRes.error?.code === "42P01");
  return c.json({
    brandId,
    brandName: brand.name,
    migrationApplied,
    stats: statsRes.data || [],
    signals: signalsRes.data || [],
  });
});

export default app;

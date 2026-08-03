// POST /api/briefs/sharpen — fires a02 The Sharpener.
// Body: { briefText, brandId? }
// Returns: { tension, sharpenedBrief, questions, proposedSpecialists, refusals, usage }
//
// The SPA's HomeCreate flow calls this on `Start`, renders the real
// brand-aware questions, and (after user answers or skips) passes the
// sharpened context into each /api/runs/stream call.
//
// GET /api/briefs/:id/estimate — §7 pre-run credit estimate for a crew.
// Returns: { total_credits, breakdown:[{ specialistId, credits, source }] }
// CREDITS ONLY — never raw USD; this is SPA-facing.

import { Hono } from "hono";
import { requireAuth } from "../middleware/auth.js";
import { supabaseAdmin } from "../lib/supabase.js";
import { loadBrandBio } from "../lib/load-brand-bio.js";
import { sharpenBrief } from "../lib/sharpener.js";
import { loadBrandMemorySummary } from "../lib/brandolph-memory.js";
import { estimateCrewCredits } from "../lib/pricing.js";

const app = new Hono();

app.post("/sharpen", requireAuth, async (c) => {
  const { workspaceId } = c.get("auth");
  let body;
  try { body = await c.req.json(); } catch { return c.json({ error: "Invalid JSON" }, 400); }
  const { briefText, brandId } = body || {};
  if (!briefText || typeof briefText !== "string") return c.json({ error: "briefText required" }, 400);

  let brandBio;
  try {
    brandBio = await loadBrandBio({ workspaceId, brandId });
  } catch (err) {
    if (err.code === "BIO_NOT_READY") {
      return c.json({ error: "Run Discovery to build your brand's BIO first.", code: err.code }, 409);
    }
    return c.json({ error: err.message || String(err) }, 400);
  }

  /* Pull this brand's running memory — short markdown summary the
     Sharpener uses to recommend specialists that have actually
     shipped for THIS brand. Best-effort: returns "" on a fresh brand. */
  let memorySummary = "";
  try {
    memorySummary = await loadBrandMemorySummary(brandBio.brand.id);
  } catch (e) {
    console.warn("[briefs] memory load failed:", e?.message || e);
  }

  try {
    const result = await sharpenBrief({
      briefText,
      brand: brandBio.brand,
      bio: brandBio.bio,
      refusals: brandBio.refusals,
      memorySummary,
    });
    return c.json({
      ...result,
      brand: { name: brandBio.brand.name, bioVersion: brandBio.bio?.version },
    });
  } catch (e) {
    return c.json({ error: e?.message || String(e) }, 500);
  }
});

/* GET /api/briefs/estimate?crew=a01,a12 — crew-scoped pre-run estimate.
   The approval UI has NO brief yet (the brief is created lazily at run
   time), so the brief-scoped route below can't serve it. Auth-only: the
   crew are global specialist ids and the response is credits-only (a
   trailing-30d average), carrying no brand data. Registered before the
   `/:id/estimate` route; the paths don't overlap (one segment vs two). */
app.get("/estimate", requireAuth, async (c) => {
  const crewParam = c.req.query("crew");
  const crew = crewParam ? crewParam.split(",").map((s) => s.trim()).filter(Boolean) : [];
  if (!crew.length) return c.json({ total_credits: 0, breakdown: [] });
  const result = await estimateCrewCredits({ specialistIds: crew, at: new Date().toISOString() });
  return c.json(result);
});

/* GET /api/briefs/:id/estimate — Σ estimated credits for a crew (§7).
   Each specialist is priced from its trailing-30-day average when real
   runs exist, else its `cr` estimate. Crew comes from `?crew=a01,a12`
   (the SPA's approval assembly) or falls back to the brief's proposed
   specialists. CREDITS ONLY in the response — no raw USD ever leaves here. */
app.get("/:id/estimate", requireAuth, async (c) => {
  const { workspaceId } = c.get("auth");
  const briefId = c.req.param("id");

  const { data: brief } = await supabaseAdmin
    .from("briefs").select("id, brand_id, payload").eq("id", briefId).maybeSingle();
  if (!brief) return c.json({ error: "Not found" }, 404);

  /* Ownership: brief → brand → workspace. */
  const { data: brand } = await supabaseAdmin
    .from("brands").select("workspace_id").eq("id", brief.brand_id).maybeSingle();
  if (!brand || brand.workspace_id !== workspaceId) return c.json({ error: "Forbidden" }, 403);

  const crewParam = c.req.query("crew");
  const crew = crewParam
    ? crewParam.split(",").map((s) => s.trim()).filter(Boolean)
    : (Array.isArray(brief.payload?.proposedSpecialists) ? brief.payload.proposedSpecialists : []);
  if (!crew.length) return c.json({ total_credits: 0, breakdown: [] });

  const result = await estimateCrewCredits({ specialistIds: crew, at: new Date().toISOString() });
  return c.json(result);
});

export default app;

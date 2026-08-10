// POST /api/briefs/sharpen — fires a02 The Sharpener.
// Body: { briefText, brandId? }
// Returns: { tension, sharpenedBrief, questions, proposedSpecialists, refusals, usage }
//
// The SPA's HomeCreate flow calls this on `Start`, renders the real
// brand-aware questions, and (after user answers or skips) passes the
// sharpened context into each /api/runs/stream call.

import { Hono } from "hono";
import { requireAuth } from "../middleware/auth.js";
import { loadBioForRun } from "../lib/load-brand-bio.js";
import { sharpenBrief } from "../lib/sharpener.js";
import { loadBrandMemorySummary } from "../lib/brandolph-memory.js";

const app = new Hono();

app.post("/sharpen", requireAuth, async (c) => {
  const { workspaceId } = c.get("auth");
  let body;
  try { body = await c.req.json(); } catch { return c.json({ error: "Invalid JSON" }, 400); }
  const { briefText, brandId } = body || {};
  if (!briefText || typeof briefText !== "string") return c.json({ error: "briefText required" }, 400);
  if (!brandId || typeof brandId !== "string") {
    return c.json({ error: "Select a brand before creating a brief.", code: "BRAND_REQUIRED" }, 400);
  }

  let brandBio;
  try {
    brandBio = await loadBioForRun({ workspaceId, brandId });
  } catch (err) {
    if (err.code === "BIO_NOT_CERTIFIED") {
      return c.json({ error: "BIO is awaiting Brand Steward certification.", code: err.code }, 409);
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
      brand: { id: brandBio.brand.id, name: brandBio.brand.name, bioVersion: brandBio.bio?.version },
    });
  } catch (e) {
    return c.json({ error: e?.message || String(e) }, 500);
  }
});

export default app;

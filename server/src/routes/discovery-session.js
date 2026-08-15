// discovery-session.js — M3 draft lane.
//
// Mounted at /api/discovery. Backs the resumable discovery experience with a
// server-authoritative DRAFT that is edited via autosave WITHOUT creating bios
// versions or steward jobs. Promotion to a real (candidate) bios version
// happens only on attest — which then runs the shared self-cert gate. This is
// what gives save/resume and keeps the certified BIO the agents read untouched
// by in-progress drafts.
//
//   GET   /session/:brandId          → load (or open) the brand's draft session
//   PATCH /session/:brandId          → autosave provided fields onto the draft
//   POST  /session/:brandId/attest   → promote draft → bios version + self-cert

import { Hono } from "hono";
import { requireAuth } from "../middleware/auth.js";
import { supabaseAdmin } from "../lib/supabase.js";
import { normalizeBio } from "../lib/bio-schema.js";
import { scoreBio } from "../lib/score-bio.js";
import { payloadHash } from "../lib/bio-hash.js";
import { selfCertifyBio } from "../lib/self-certify.js";

const app = new Hono();

const SESSION_COLS = "draft_payload, cursor, chapter_status, attested, status";

// Ownership check: return the brand row only when it lives in the caller's
// workspace, else null (the route turns null into a 403).
async function ownedBrand(brandId, workspaceId) {
  const { data: brand } = await supabaseAdmin
    .from("brands").select("id, workspace_id").eq("id", brandId).maybeSingle();
  return brand && brand.workspace_id === workspaceId ? brand : null;
}

// Order-insensitive deep compare of two BIO payloads (reuses the cert hash).
const sameJson = (a, b) => payloadHash(a) === payloadHash(b);

/* GET /session/:brandId
   Returns the brand's draft session, creating one seeded from the latest bios
   payload (or an empty canonical BIO) if none exists yet. */
app.get("/session/:brandId", requireAuth, async (c) => {
  const { workspaceId } = c.get("auth");
  const brandId = c.req.param("brandId");
  if (!(await ownedBrand(brandId, workspaceId))) return c.json({ error: "Brand not in workspace" }, 403);

  // Latest bios row — the seed for a fresh draft and the reported bioVersion.
  const { data: latestBio } = await supabaseAdmin
    .from("bios").select("version, payload").eq("brand_id", brandId)
    .order("version", { ascending: false }).limit(1).maybeSingle();

  let { data: session } = await supabaseAdmin
    .from("discovery_sessions").select(SESSION_COLS).eq("brand_id", brandId).maybeSingle();

  if (!session) {
    const draft = normalizeBio(latestBio?.payload || {});
    const { data: created, error } = await supabaseAdmin
      .from("discovery_sessions")
      .insert({ brand_id: brandId, workspace_id: workspaceId, draft_payload: draft, status: "active" })
      .select(SESSION_COLS).single();
    if (error) return c.json({ error: error.message }, 500);
    session = created;
  }

  return c.json({ session, bioVersion: latestBio?.version ?? null });
});

/* PATCH /session/:brandId
   Autosave. Updates ONLY the provided fields (+ updated_at) on the brand's
   session; creates the session if a client autosaves before GET. No bios
   version, no steward job. */
app.patch("/session/:brandId", requireAuth, async (c) => {
  const { workspaceId } = c.get("auth");
  const brandId = c.req.param("brandId");
  if (!(await ownedBrand(brandId, workspaceId))) return c.json({ error: "Brand not in workspace" }, 403);

  const body = await c.req.json().catch(() => ({}));
  const patch = { updated_at: new Date().toISOString() };
  if (body.draft_payload !== undefined) patch.draft_payload = body.draft_payload;
  if (body.cursor !== undefined) patch.cursor = body.cursor;
  if (body.chapter_status !== undefined) patch.chapter_status = body.chapter_status;
  if (body.attested !== undefined) patch.attested = body.attested;

  const { data: existing } = await supabaseAdmin
    .from("discovery_sessions").select("id").eq("brand_id", brandId).maybeSingle();

  let row, error;
  if (existing) {
    ({ data: row, error } = await supabaseAdmin
      .from("discovery_sessions").update(patch).eq("brand_id", brandId)
      .select("updated_at").single());
  } else {
    ({ data: row, error } = await supabaseAdmin
      .from("discovery_sessions")
      .insert({ brand_id: brandId, workspace_id: workspaceId, status: "active", ...patch })
      .select("updated_at").single());
  }
  if (error) return c.json({ error: error.message }, 500);

  return c.json({ ok: true, updated_at: row.updated_at });
});

/* POST /session/:brandId/attest
   Body: { statements, fieldMarks?, statementVersion? }
   Promotes the draft to a new (candidate) bios version when it differs from
   the latest version, then runs the shared self-cert gate against that target.
   On success the session is marked completed. */
app.post("/session/:brandId/attest", requireAuth, async (c) => {
  const { workspaceId, userId } = c.get("auth");
  const brandId = c.req.param("brandId");
  if (!(await ownedBrand(brandId, workspaceId))) return c.json({ error: "Brand not in workspace" }, 403);

  const body = await c.req.json().catch(() => ({}));

  const { data: session } = await supabaseAdmin
    .from("discovery_sessions").select("id, draft_payload").eq("brand_id", brandId).maybeSingle();
  if (!session) return c.json({ error: "No discovery session to attest", code: "NO_SESSION" }, 400);
  const draft = session.draft_payload || {};

  const { data: latestBio } = await supabaseAdmin
    .from("bios").select("id, version, payload").eq("brand_id", brandId)
    .order("version", { ascending: false }).limit(1).maybeSingle();

  // Promote the draft only when it actually differs from the latest version;
  // otherwise attest the existing row.
  let target = latestBio;
  if (!latestBio || !sameJson(latestBio.payload, draft)) {
    const nextVersion = (latestBio?.version || 0) + 1;
    const { data: inserted, error } = await supabaseAdmin
      .from("bios")
      .insert({
        brand_id: brandId, version: nextVersion, payload: draft,
        score: scoreBio(draft), certified: false, self_certified: false, created_by: userId,
      })
      .select("id, version, payload").single();
    if (error) return c.json({ error: error.message }, 500);
    target = inserted;
  }

  const result = await selfCertifyBio({
    brandId, bioId: target.id, payload: target.payload, userId,
    statements: body.statements, fieldMarks: body.fieldMarks, statementVersion: body.statementVersion,
  });
  if (!result.ok) { const { ok, ...err } = result; return c.json(err, 400); }

  await supabaseAdmin.from("discovery_sessions")
    .update({ status: "completed", updated_at: new Date().toISOString() })
    .eq("brand_id", brandId);

  return c.json({ ok: true, version: target.version, self_certified: true, score: result.score });
});

export default app;

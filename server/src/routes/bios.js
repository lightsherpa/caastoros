import { Hono } from "hono";
import { requireAuth } from "../middleware/auth.js";
import { supabaseAdmin } from "../lib/supabase.js";
import { assignSteward } from "../lib/assign-steward.js";
import { scoreBio } from "../lib/score-bio.js";
import { computeFocus } from "../lib/bio-focus.js";

const app = new Hono();

/* POST /api/bios/:brandId/sources
   Body: { sources: [{ kind, bucket, src, signals? }, ...] }
   Auth: required. Caller must own the brand (workspace check).
   Writes one bio_sources row per source. `bucket` matches the QW-003
   three-bucket UI ("foundations" | "visual" | "voice"). URL-derived
   sources (scrape results) can leave bucket null.

   File uploads land via Supabase Storage in a separate flow (P1-003
   follow-up); this endpoint accepts URL/text references only.        */
app.post("/:brandId/sources", requireAuth, async (c) => {
  const { workspaceId } = c.get("auth");
  const brandId = c.req.param("brandId");

  // Ownership check
  const { data: brand, error: brandErr } = await supabaseAdmin
    .from("brands")
    .select("id, workspace_id")
    .eq("id", brandId)
    .maybeSingle();
  if (brandErr) return c.json({ error: brandErr.message }, 500);
  if (!brand || brand.workspace_id !== workspaceId) return c.json({ error: "Brand not in workspace" }, 403);

  let body;
  try { body = await c.req.json(); } catch { return c.json({ error: "Invalid JSON" }, 400); }
  const sources = Array.isArray(body?.sources) ? body.sources : [];
  if (sources.length === 0) return c.json({ error: "sources[] required" }, 400);

  const rows = sources.map((s) => ({
    brand_id: brandId,
    kind:     s.kind || "reference",
    bucket:   ["foundations", "visual", "voice"].includes(s.bucket) ? s.bucket : null,
    src:      String(s.src ?? ""),
    signals:  s.signals ?? null,
    raw_ref:  s.raw_ref ?? null,
  }));

  const { data: inserted, error: insertErr } = await supabaseAdmin
    .from("bio_sources")
    .insert(rows)
    .select("id, bucket, src");
  if (insertErr) return c.json({ error: insertErr.message }, 500);

  return c.json({ inserted: inserted.length, sources: inserted });
});

/* POST /api/bios/:brandId/sources/upload
   Multipart: file + bucket (foundations|visual|voice).
   Stores the file in Supabase Storage (private `bio-sources` bucket),
   writes uploads + bio_sources rows. Returns the new source + signed URL. */
app.post("/:brandId/sources/upload", requireAuth, async (c) => {
  const { workspaceId, userId } = c.get("auth");
  const brandId = c.req.param("brandId");

  const { data: brand } = await supabaseAdmin
    .from("brands").select("id, workspace_id").eq("id", brandId).maybeSingle();
  if (!brand || brand.workspace_id !== workspaceId) return c.json({ error: "Brand not in workspace" }, 403);

  const form = await c.req.formData().catch(() => null);
  if (!form) return c.json({ error: "multipart/form-data required" }, 400);
  const file = form.get("file");
  const bucket = String(form.get("bucket") || "").trim();
  if (!file || typeof file === "string") return c.json({ error: "file required" }, 400);
  if (!["foundations","visual","voice"].includes(bucket)) return c.json({ error: "bucket must be foundations|visual|voice" }, 400);

  const filename = file.name || "upload.bin";
  const ext = filename.includes(".") ? filename.split(".").pop() : "bin";
  const safeName = filename.replace(/[^a-z0-9._-]+/gi, "_").slice(0, 80);
  const objectPath = `${workspaceId}/${brandId}/${crypto.randomUUID()}-${safeName}`;

  const buf = new Uint8Array(await file.arrayBuffer());
  const { data: uploadData, error: uploadErr } = await supabaseAdmin
    .storage.from("bio-sources")
    .upload(objectPath, buf, { contentType: file.type || "application/octet-stream", upsert: false });
  if (uploadErr) return c.json({ error: `Storage upload failed: ${uploadErr.message}` }, 500);

  /* Sign a 1-year URL for retrieval. RLS on the storage.objects table
     could replace this with per-request signing later. */
  const { data: signed } = await supabaseAdmin
    .storage.from("bio-sources")
    .createSignedUrl(objectPath, 60 * 60 * 24 * 365);

  const { data: uploadRow } = await supabaseAdmin
    .from("uploads")
    .insert({
      workspace_id: workspaceId,
      user_id: userId,
      brand_id: brandId,
      url: signed?.signedUrl || objectPath,
      mime: file.type || null,
      bucket_hint: bucket,
    })
    .select("id, url")
    .single();

  const { data: sourceRow, error: sourceErr } = await supabaseAdmin
    .from("bio_sources")
    .insert({
      brand_id: brandId,
      kind: "file_upload",
      bucket,
      src: filename,
      signals: { size: file.size, mime: file.type, upload_id: uploadRow?.id, ext },
      raw_ref: uploadRow?.url,
    })
    .select("id, bucket, src, signals, raw_ref")
    .single();
  if (sourceErr) return c.json({ error: sourceErr.message }, 500);

  return c.json({ source: sourceRow, signedUrl: uploadRow?.url });
});

/* PATCH /api/bios/:brandId
   Body: { payload }
   Creates a NEW bios row (append-only versioned per rev-2 §5.5),
   self-certified so the edit takes effect on the next run, and enqueues a
   Steward drift_check for senior re-certification. Returns the new row. */
app.patch("/:brandId", requireAuth, async (c) => {
  const { workspaceId, userId } = c.get("auth");
  const brandId = c.req.param("brandId");

  const { data: brand } = await supabaseAdmin
    .from("brands").select("id, workspace_id").eq("id", brandId).maybeSingle();
  if (!brand || brand.workspace_id !== workspaceId) return c.json({ error: "Brand not in workspace" }, 403);

  const body = await c.req.json().catch(() => ({}));
  if (!body.payload || typeof body.payload !== "object") return c.json({ error: "payload required" }, 400);

  const { data: latest } = await supabaseAdmin
    .from("bios").select("version").eq("brand_id", brandId)
    .order("version", { ascending: false }).limit(1).maybeSingle();
  const nextVersion = (latest?.version || 0) + 1;

  const { data: newRow, error } = await supabaseAdmin
    .from("bios")
    .insert({
      brand_id: brandId,
      version: nextVersion,
      payload: body.payload,
      score: scoreBio(body.payload || {}),
      /* Self-certified like the Discovery compile — otherwise the user edits
         their BIO and loadBioForRun keeps serving the older certified version,
         so the edit silently never reaches a specialist. certified_by stays
         NULL until a Steward signs the drift_check queued below. */
      certified: true,
      certified_at: new Date().toISOString(),
      created_by: userId,
    })
    .select("id, version, payload, score, certified, created_at")
    .single();
  if (error) return c.json({ error: error.message }, 500);

  /* P1.5-005 — every BIO edit enqueues a drift_check Steward job so a
     senior human re-reads the user's edits. Note the row above is already
     self-certified, so loadBioForRun serves THIS version immediately; the
     Steward job is what later attaches certified_by (tier 2), not what
     activates the version. Fire-and-forget here — the route returns
     immediately; the helper handles its own errors via override_reason. */
  try {
    const { data: stewardJob } = await supabaseAdmin
      .from("steward_jobs")
      .insert({
        bio_id: newRow.id,
        brand_id: brandId,
        kind: "drift_check",
        status: "queued",
      })
      .select("id")
      .single();
    if (stewardJob?.id) await assignSteward(stewardJob.id);
  } catch (e) {
    console.warn("[bios PATCH] failed to enqueue drift_check Steward job:", e?.message || e);
  }

  return c.json({ bio: newRow });
});

/* GET /api/bios/:brandId
   Returns latest BIO version + cert state. Used by the BIO viewer. */
app.get("/:brandId", requireAuth, async (c) => {
  const { workspaceId } = c.get("auth");
  const brandId = c.req.param("brandId");

  const { data: brand } = await supabaseAdmin
    .from("brands")
    .select("id, name, workspace_id")
    .eq("id", brandId)
    .maybeSingle();
  if (!brand || brand.workspace_id !== workspaceId) return c.json({ error: "Brand not in workspace" }, 403);

  const { data: bio } = await supabaseAdmin
    .from("bios")
    .select("id, version, payload, score, certified, certified_by, certified_at, cert_kind, steward_notes, created_at")
    .eq("brand_id", brandId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  /* Surface whether a human review is already in flight for this BIO so
     the client can show "review requested" instead of offering the button
     again. Open = queued | in_review | pending_lead_review. */
  let reviewPending = false;
  if (bio?.id) {
    const { data: openJob } = await supabaseAdmin
      .from("steward_jobs")
      .select("id")
      .eq("bio_id", bio.id)
      .in("status", ["queued", "in_review", "pending_lead_review"])
      .limit(1)
      .maybeSingle();
    reviewPending = !!openJob;
  }

  /* Softened client-side signal: how many fields the Steward would still
     focus on for this BIO's payload. Count only — the full focus list is
     served by the Steward route, not here. */
  const focusCount = bio?.payload ? computeFocus(bio.payload).length : 0;

  return c.json({ brand, bio, reviewPending, focusCount });
});

/* POST /api/bios/:brandId/request-review
   Client-initiated: enqueue a Steward re-review of the CURRENT BIO without
   editing it. Idempotent — if an open job already exists for this BIO it
   returns that one instead of stacking duplicates. */
app.post("/:brandId/request-review", requireAuth, async (c) => {
  const { workspaceId } = c.get("auth");
  const brandId = c.req.param("brandId");

  const { data: brand } = await supabaseAdmin
    .from("brands").select("id, workspace_id").eq("id", brandId).maybeSingle();
  if (!brand || brand.workspace_id !== workspaceId) return c.json({ error: "Brand not in workspace" }, 403);

  const { data: bio } = await supabaseAdmin
    .from("bios").select("id, version").eq("brand_id", brandId)
    .order("version", { ascending: false }).limit(1).maybeSingle();
  if (!bio) return c.json({ error: "No BIO to review yet" }, 400);

  // Idempotency: reuse an existing open job for this BIO.
  const { data: existing } = await supabaseAdmin
    .from("steward_jobs").select("id, status")
    .eq("bio_id", bio.id)
    .in("status", ["queued", "in_review", "pending_lead_review"])
    .limit(1).maybeSingle();
  if (existing) return c.json({ ok: true, jobId: existing.id, status: existing.status, reused: true });

  const { data: job, error } = await supabaseAdmin
    .from("steward_jobs")
    .insert({ bio_id: bio.id, brand_id: brandId, kind: "drift_check", status: "queued" })
    .select("id")
    .single();
  if (error) return c.json({ error: error.message }, 500);

  try { await assignSteward(job.id); } catch (e) { console.warn("[request-review] assignSteward failed:", e?.message || e); }

  return c.json({ ok: true, jobId: job.id, status: "queued", reused: false });
});

export default app;

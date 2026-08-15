import { Hono } from "hono";
import { requireAuth } from "../middleware/auth.js";
import { supabaseAdmin } from "../lib/supabase.js";
import { assignSteward } from "../lib/assign-steward.js";
import { scoreBio } from "../lib/score-bio.js";
import { validateUpload, assertPublicUrl, MAX_UPLOAD_BYTES } from "../lib/ingest-guards.js";
import { computeFocus } from "../lib/bio-focus.js";
import { selfCertifyBio } from "../lib/self-certify.js";
import { diffBio } from "../lib/bio-diff.js";
import { SCORED_PATHS } from "../lib/bio-schema.js";

const app = new Hono();

// SECURITY (P3 C-1): a client must NOT author the BIO's confidence/provenance
// map — a fabricated {conf:100, source:"a".."e"} inflates avgConf + diversity,
// drives the score to 100, and clears the self-cert floor. On a client edit we
// discard any client-supplied confidence/missing/conflicts and stamp a uniform
// "client-stated" provenance, so the score reflects coverage + one human-stated
// source, never an attacker-chosen number.
const nonEmptyVal = (v) => (Array.isArray(v) ? v.length > 0 : v != null && String(v).trim() !== "");
function sanitizeClientPayload(payload) {
  const p = { ...(payload || {}) };
  delete p.confidence; delete p.missing; delete p.conflicts;
  const confidence = {};
  for (const [s, k] of SCORED_PATHS) {
    if (nonEmptyVal(p?.[s]?.[k])) confidence[`${s}.${k}`] = { conf: 80, source: "client-stated" };
  }
  p.confidence = confidence;
  return p;
}

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

  // SECURITY (P3 H-2): a client-supplied raw_ref is later fetched by the
  // compiler — validate any URL against the SSRF guard before storing it.
  for (const s of sources) {
    if (s?.raw_ref && /^https?:\/\//i.test(String(s.raw_ref))) {
      try { assertPublicUrl(String(s.raw_ref)); }
      catch (e) { return c.json({ error: `Blocked source URL (${e.code || "URL"})`, code: e.code || "BAD_URL" }, 400); }
    }
  }

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

  // SECURITY (P3 M-1): reject an oversized upload by declared length BEFORE
  // buffering the whole multipart body into memory.
  const declaredLen = Number(c.req.header("content-length") || 0);
  if (declaredLen && declaredLen > MAX_UPLOAD_BYTES + 8192) {
    return c.json({ error: "File too large", code: "TOO_LARGE" }, 413);
  }

  const form = await c.req.formData().catch(() => null);
  if (!form) return c.json({ error: "multipart/form-data required" }, 400);
  const file = form.get("file");
  const bucket = String(form.get("bucket") || "").trim();
  if (!file || typeof file === "string") return c.json({ error: "file required" }, 400);
  if (!["foundations","visual","voice"].includes(bucket)) return c.json({ error: "bucket must be foundations|visual|voice" }, 400);
  const filename = file.name || "upload.bin";
  // Untrusted upload — validate type + size BEFORE buffering the whole file
  // into memory (evidence is parsed by an LLM, so it is an injection surface).
  const vUp = validateUpload({ mime: file.type, size: file.size, filename });
  if (!vUp.ok) return c.json({ error: vUp.message, code: vUp.code }, vUp.code === "TOO_LARGE" ? 413 : 400);
  const ext = vUp.ext || "bin";
  const mime = file.type || "application/octet-stream";
  const safeName = filename.replace(/[^a-z0-9._-]+/gi, "_").slice(0, 80);
  const objectPath = `${workspaceId}/${brandId}/${crypto.randomUUID()}-${safeName}`;

  const buf = new Uint8Array(await file.arrayBuffer());
  const { data: uploadData, error: uploadErr } = await supabaseAdmin
    .storage.from("bio-sources")
    .upload(objectPath, buf, { contentType: mime, upsert: false });
  if (uploadErr) return c.json({ error: `Storage upload failed: ${uploadErr.message}` }, 500);

  /* Store the durable object path, not an expiring signed URL. */
  const { data: signed } = await supabaseAdmin
    .storage.from("bio-sources")
    .createSignedUrl(objectPath, 60 * 60);

  const { data: uploadRow, error: uploadRowErr } = await supabaseAdmin
    .from("uploads")
    .insert({
      workspace_id: workspaceId,
      user_id: userId,
      brand_id: brandId,
      url: objectPath,
      mime,
      bucket_hint: bucket,
    })
    .select("id, url")
    .single();
  if (uploadRowErr) {
    await supabaseAdmin.storage.from("bio-sources").remove([objectPath]);
    return c.json({ error: `Upload metadata failed: ${uploadRowErr.message}` }, 500);
  }

  const { data: sourceRow, error: sourceErr } = await supabaseAdmin
    .from("bio_sources")
    .insert({
      brand_id: brandId,
      kind: "file_upload",
      bucket,
      src: filename,
      signals: { size: file.size, mime, upload_id: uploadRow?.id, ext },
      raw_ref: objectPath,
    })
    .select("id, bucket, src, signals, raw_ref")
    .single();
  if (sourceErr) {
    await Promise.all([
      supabaseAdmin.from("uploads").delete().eq("id", uploadRow.id),
      supabaseAdmin.storage.from("bio-sources").remove([objectPath]),
    ]);
    return c.json({ error: sourceErr.message }, 500);
  }

  return c.json({ source: sourceRow, signedUrl: signed?.signedUrl || null });
});

/* PATCH /api/bios/:brandId
   Body: { payload }
   Creates a NEW bios row (append-only versioned per rev-2 §5.5) with
   certified=false. Doesn't auto-enqueue a Steward drift_check yet —
   that's P1.5-005, deferred. Returns the new bios row. */
app.patch("/:brandId", requireAuth, async (c) => {
  const { workspaceId, userId } = c.get("auth");
  const brandId = c.req.param("brandId");

  const { data: brand } = await supabaseAdmin
    .from("brands").select("id, workspace_id").eq("id", brandId).maybeSingle();
  if (!brand || brand.workspace_id !== workspaceId) return c.json({ error: "Brand not in workspace" }, 403);

  const body = await c.req.json().catch(() => ({}));
  if (!body.payload || typeof body.payload !== "object") return c.json({ error: "payload required" }, 400);
  const cleanPayload = sanitizeClientPayload(body.payload); // strip client-authored confidence (P3 C-1)

  const { data: newRow, error } = await supabaseAdmin
    .rpc("append_bio_version", {
      p_brand_id: brandId,
      p_payload: cleanPayload,
      p_score: scoreBio(cleanPayload),
      p_created_by: userId,
      p_discovery_id: null,
    });
  if (error) return c.json({ error: error.message }, 500);

  /* P1.5-005 — every BIO edit enqueues a drift_check Steward job so a
     senior human re-reviews the user's edits before this version
     becomes the active BIO for specialist runs. loadBioForRun (§5.5)
     keeps serving the previously-certified version until this one is
     certified. Fire-and-forget here — the route returns immediately;
     the helper handles its own errors via the override_reason field. */
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
    .select("id, version, payload, score, certified, certified_by, certified_at, cert_kind, steward_notes, self_certified, self_certified_at, discovery_id, created_at, created_by")
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

  /* Steward ↔ client review loop. `review` surfaces the latest reviewer verdict
     ("From your Steward"); `diff` shows what the Steward changed when THEY
     authored the latest version. Both null/[] when there's nothing to show. */
  let review = null;
  let diff = [];
  if (bio?.id) {
    // Most recent decision recorded against THIS (latest) BIO version.
    const { data: job } = await supabaseAdmin
      .from("steward_jobs")
      .select("decision, required_changes, conditions, reject_reason_code, completed_at, assigned_to, lead_reviewed_by")
      .eq("bio_id", bio.id)
      .not("decision", "is", null)
      .order("queued_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (job) {
      // Reviewer's given name: the scoring Steward, else the finalizing Lead.
      let stewardFirstName = null;
      const reviewerId = job.assigned_to || job.lead_reviewed_by;
      if (reviewerId) {
        const { data: tm } = await supabaseAdmin
          .from("team_members").select("first_name").eq("id", reviewerId).maybeSingle();
        stewardFirstName = tm?.first_name || null;
      }
      review = {
        decision: job.decision,
        required_changes: job.required_changes ?? null,
        conditions: job.conditions ?? null,
        reject_reason_code: job.reject_reason_code ?? null,
        steward_notes: bio.steward_notes ?? null,
        decided_at: job.completed_at ?? null,
        steward_first_name: stewardFirstName,
      };
    }

    /* Diff only when the Steward AUTHORED the latest version. A client edit
       stamps created_by; the Steward's in-review bioPatch leaves it null, so
       a null author + a recorded review = a Steward edit. Needs a prior
       version to compare against. */
    if (review && bio.created_by == null) {
      const { data: versions } = await supabaseAdmin
        .from("bios")
        .select("payload")
        .eq("brand_id", brandId)
        .order("version", { ascending: false })
        .limit(2);
      if (Array.isArray(versions) && versions.length === 2) {
        diff = diffBio(versions[1].payload, versions[0].payload);
      }
    }
  }

  return c.json({ brand, bio, reviewPending, focusCount, review, diff });
});

/* POST /api/bios/:brandId/self-certify
   Stage-1 client attestation. Binds an immutable bio_attestations record to
   the exact BIO version and flips bios.self_certified — which UNLOCKS
   briefing. Editing the BIO creates a new (self_certified=false) version, so
   the attestation auto-lapses. Preconditions are pure: three affirmed
   statements, no missing high-importance field, minimum score. */
app.post("/:brandId/self-certify", requireAuth, async (c) => {
  const { workspaceId, userId } = c.get("auth");
  const brandId = c.req.param("brandId");

  const { data: brand } = await supabaseAdmin
    .from("brands").select("id, workspace_id").eq("id", brandId).maybeSingle();
  if (!brand || brand.workspace_id !== workspaceId) return c.json({ error: "Brand not in workspace" }, 403);

  const body = await c.req.json().catch(() => ({}));

  const { data: bio } = await supabaseAdmin
    .from("bios").select("id, version, payload").eq("brand_id", brandId)
    .order("version", { ascending: false }).limit(1).maybeSingle();
  if (!bio) return c.json({ error: "No BIO to certify yet", code: "NO_BIO" }, 400);

  // Shared gate: statements + field marks + high-importance gaps + min score,
  // then the attestation write + self_certified flip (see lib/self-certify.js).
  const result = await selfCertifyBio({
    brandId, bioId: bio.id, payload: bio.payload || {}, userId,
    statements: body.statements, fieldMarks: body.fieldMarks, statementVersion: body.statementVersion,
  });
  if (!result.ok) { const { ok, ...err } = result; return c.json(err, 400); }

  return c.json({ ok: true, self_certified: true, version: bio.version, score: result.score });
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
  if (error) {
    if (error.code === "23505") {
      const { data: raced } = await supabaseAdmin.from("steward_jobs")
        .select("id, status").eq("bio_id", bio.id)
        .in("status", ["queued", "in_review", "pending_lead_review"])
        .limit(1).maybeSingle();
      if (raced) return c.json({ ok: true, jobId: raced.id, status: raced.status, reused: true });
    }
    return c.json({ error: error.message }, 500);
  }

  try { await assignSteward(job.id); } catch (e) { console.warn("[request-review] assignSteward failed:", e?.message || e); }

  return c.json({ ok: true, jobId: job.id, status: "queued", reused: false });
});

export default app;

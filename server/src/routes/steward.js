// ─────────────────────────────────────────────────────────────────────
// P1.5 Steward operation — backend routes.
//
// GET  /api/steward/jobs            → list jobs visible to caller
// GET  /api/steward/jobs/:id         → one job + the candidate BIO
// PATCH /api/steward/jobs/:id        → submit certification (+ optional BIO patch)
//
// Role gate: caller must have a `team_members` row with 'steward' or
// 'lead_steward' in roles[]. Enforced server-side as the moat
// guardrail — bypassing this is the difference between "a senior
// human certified my brand" and "anyone with a JWT did it".
// ─────────────────────────────────────────────────────────────────────

import { Hono } from "hono";
import { requireAuth } from "../middleware/auth.js";
import { supabaseAdmin } from "../lib/supabase.js";
import { computeFocus } from "../lib/bio-focus.js";

const app = new Hono();

/**
 * Resolve the caller's team_member row. Returns null if they're not
 * a team member at all.
 */
async function getCallerSteward(userId) {
  const { data } = await supabaseAdmin
    .from("team_members")
    .select("id, name, first_name, roles, active")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data || !data.active) return null;
  const isSteward = data.roles?.some((r) => r === "steward" || r === "lead_steward");
  return isSteward ? data : null;
}

/**
 * Middleware: 403 if caller isn't a Steward (or Lead).
 * Attaches the team_member row to c.set("steward", ...).
 */
async function requireSteward(c, next) {
  const { userId } = c.get("auth");
  const steward = await getCallerSteward(userId);
  if (!steward) return c.json({ error: "Steward role required" }, 403);
  c.set("steward", steward);
  await next();
}

/* GET /api/steward/jobs — list jobs visible to the caller.
   By default returns 'queued' and 'in_review' jobs assigned to caller
   OR unassigned jobs (so they can claim one).                          */
app.get("/jobs", requireAuth, requireSteward, async (c) => {
  const steward = c.get("steward");
  const { data, error } = await supabaseAdmin
    .from("steward_jobs")
    .select(`
      id, bio_id, brand_id, kind, status, assigned_to,
      outputs_reviewed_count, override_reason, credits_charged,
      queued_at, completed_at,
      brand:brands ( id, name, url )
    `)
    .in("status", ["queued", "in_review", "pending_lead_review"])
    .or(`assigned_to.eq.${steward.id},assigned_to.is.null`)
    .order("queued_at", { ascending: true });

  if (error) return c.json({ error: error.message }, 500);
  return c.json({ jobs: data, you: { id: steward.id, name: steward.name, roles: steward.roles } });
});

/* GET /api/steward/jobs/:id — full job + candidate BIO for review. */
app.get("/jobs/:id", requireAuth, requireSteward, async (c) => {
  const steward = c.get("steward");
  const jobId = c.req.param("id");
  const { data: job, error } = await supabaseAdmin
    .from("steward_jobs")
    .select(`
      id, bio_id, brand_id, kind, status, assigned_to, override_reason, queued_at,
      lead_reviewed_by, lead_reviewed_at,
      bio:bios ( id, version, payload, score, certified, certified_by, certified_at, created_at ),
      brand:brands ( id, name, url, industry )
    `)
    .eq("id", jobId)
    .maybeSingle();
  if (error || !job) return c.json({ error: error?.message || "Not found" }, 404);

  // Pull all sources (foundations/visual/voice) for this brand so the
  // Steward sees what the Compiler had to work with.
  const { data: sources } = await supabaseAdmin
    .from("bio_sources")
    .select("id, kind, bucket, src, signals, created_at")
    .eq("brand_id", job.brand_id)
    .order("created_at", { ascending: false });

  return c.json({
    job,
    focus: computeFocus(job?.bio?.payload || {}),
    sources: sources || [],
    you: { id: steward.id, name: steward.name, first_name: steward.first_name, roles: steward.roles },
  });
});

/* PATCH /api/steward/jobs/:id — Steward submits certification OR Lead approves.
   Body shape (Steward submission):
     { status: "completed" | "cancelled", bioPatch?: object, notes?: string }
   Body shape (Lead approval of a pending_lead_review job):
     { leadApprove: true, leadNotes?: string }
     { leadApprove: false, leadNotes?: string }                          (sends back)

   Calibration gate (rev-2 §5.1 / P1.5-004): when STEWARD_CALIBRATION_REQUIRED=true,
   submissions from a non-Lead Steward land in `pending_lead_review` instead
   of finalizing. A Lead must then explicitly approve. Lead self-certs skip
   the gate (otherwise a single-Lead bench can't make progress).            */
app.patch("/jobs/:id", requireAuth, requireSteward, async (c) => {
  const steward = c.get("steward");
  const isLead = (steward.roles || []).includes("lead_steward");
  const calibration = (process.env.STEWARD_CALIBRATION_REQUIRED || "true").toLowerCase() !== "false";
  const jobId = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));

  const { data: job, error: jobErr } = await supabaseAdmin
    .from("steward_jobs")
    .select("id, bio_id, brand_id, kind, status, assigned_to")
    .eq("id", jobId)
    .maybeSingle();
  if (jobErr || !job) return c.json({ error: "Job not found" }, 404);
  if (job.status === "completed") return c.json({ error: "Already completed" }, 409);

  /* ─── Lead approval path ───────────────────────────────────────── */
  if (typeof body.leadApprove === "boolean") {
    if (!isLead) return c.json({ error: "Lead Steward role required to approve calibration" }, 403);
    if (job.status !== "pending_lead_review") return c.json({ error: `Job is ${job.status}, not pending_lead_review` }, 409);

    if (body.leadApprove === false) {
      /* Send back for revision — clear the in-flight cert metadata on
         the bios row (if it was tentatively set) and reopen the job. */
      await supabaseAdmin
        .from("bios")
        .update({ certified: false, certified_by: null, certified_at: null, cert_kind: null })
        .eq("id", job.bio_id);
      await supabaseAdmin
        .from("steward_jobs")
        .update({
          status: "in_review",
          lead_reviewed_by: steward.id,
          lead_reviewed_at: new Date().toISOString(),
          override_reason: body.leadNotes ? `lead_reject: ${body.leadNotes}` : "lead_reject",
        })
        .eq("id", jobId);
      return c.json({ ok: true, status: "in_review", action: "sent_back" });
    }

    /* Approve: finalize cert. The original certified_by stays as the
       Steward who submitted; lead_reviewed_by tracks the Lead.        */
    await supabaseAdmin
      .from("steward_jobs")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        lead_reviewed_by: steward.id,
        lead_reviewed_at: new Date().toISOString(),
      })
      .eq("id", jobId);
    const { data: certified } = await supabaseAdmin
      .from("bios").select("id, version").eq("id", job.bio_id).single();
    return c.json({
      ok: true, status: "completed", action: "approved",
      certifiedBioId: certified?.id,
      certifiedVersion: certified?.version,
      leadReviewedBy: { id: steward.id, name: steward.name },
    });
  }

  /* ─── Steward submission path ─────────────────────────────────── */
  const status = body.status;
  if (!["completed", "cancelled"].includes(status)) {
    return c.json({ error: "status must be 'completed' or 'cancelled'" }, 400);
  }

  if (!job.assigned_to) {
    await supabaseAdmin.from("steward_jobs").update({ assigned_to: steward.id, status: "in_review" }).eq("id", jobId);
  } else if (job.assigned_to !== steward.id) {
    return c.json({ error: "Job assigned to another Steward" }, 403);
  }

  if (status === "cancelled") {
    await supabaseAdmin.from("steward_jobs").update({ status: "cancelled", completed_at: new Date().toISOString() }).eq("id", jobId);
    return c.json({ ok: true, status: "cancelled" });
  }

  /* Decide final state: calibration on AND submitter is NOT a Lead →
     stage as pending_lead_review; cert metadata is set OPTIMISTICALLY on
     the bios row but the steward_jobs row stays pending. A Lead then
     finalizes via the leadApprove path above. */
  const needsLeadApproval = calibration && !isLead;
  const finalCertified = !needsLeadApproval;

  let certifiedBioId = job.bio_id;
  let certifiedVersion = null;

  if (body.bioPatch && typeof body.bioPatch === "object") {
    const { data: bio } = await supabaseAdmin
      .from("bios").select("payload, version, brand_id").eq("id", job.bio_id).single();
    const merged = { ...bio.payload, ...body.bioPatch };
    const { data: newRow, error: insertErr } = await supabaseAdmin
      .from("bios")
      .insert({
        brand_id: bio.brand_id,
        version: (bio.version || 0) + 1,
        payload: merged,
        score: 75,
        certified: finalCertified,
        certified_by: finalCertified ? steward.id : null,
        certified_at: finalCertified ? new Date().toISOString() : null,
        cert_kind: finalCertified ? job.kind : null,
        steward_notes: body.notes || null,
      })
      .select("id, version")
      .single();
    if (insertErr) return c.json({ error: insertErr.message }, 500);
    certifiedBioId = newRow.id;
    certifiedVersion = newRow.version;
  } else {
    const { data: updated, error: updateErr } = await supabaseAdmin
      .from("bios")
      .update({
        certified: finalCertified,
        certified_by: finalCertified ? steward.id : null,
        certified_at: finalCertified ? new Date().toISOString() : null,
        cert_kind: finalCertified ? job.kind : null,
        steward_notes: body.notes || null,
      })
      .eq("id", job.bio_id)
      .select("version")
      .single();
    if (updateErr) return c.json({ error: updateErr.message }, 500);
    certifiedVersion = updated.version;
  }

  const newJobStatus = needsLeadApproval ? "pending_lead_review" : "completed";
  await supabaseAdmin
    .from("steward_jobs")
    .update({
      status: newJobStatus,
      completed_at: finalCertified ? new Date().toISOString() : null,
      assigned_to: steward.id,
    })
    .eq("id", jobId);

  return c.json({
    ok: true,
    status: newJobStatus,
    certifiedBioId,
    certifiedVersion,
    certifiedBy: finalCertified ? { id: steward.id, name: steward.name } : null,
    needsLeadApproval,
  });
});

export default app;

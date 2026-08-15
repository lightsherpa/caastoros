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
import { scoreBio } from "../lib/score-bio.js";
import { notify, brandOwnerUserId } from "../lib/notify.js";

const app = new Hono();

function mergeBioPayload(base, patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return base;
  const merged = { ...(base || {}) };
  for (const [key, value] of Object.entries(patch)) {
    if (value && typeof value === "object" && !Array.isArray(value)
      && merged[key] && typeof merged[key] === "object" && !Array.isArray(merged[key])) {
      merged[key] = mergeBioPayload(merged[key], value);
    } else {
      merged[key] = value;
    }
  }
  return merged;
}

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
    .select("id, kind, bucket, src, signals, raw_ref, created_at")
    .eq("brand_id", job.brand_id)
    .order("created_at", { ascending: false });

  /* Keep private storage private while giving the assigned Steward a
     short-lived, authenticated way to inspect the evidence. Never return
     durable object paths to the browser. */
  const reviewableSources = await Promise.all((sources || []).map(async ({ raw_ref, ...source }) => {
    if (raw_ref) {
      if (/^https?:\/\//i.test(raw_ref)) return { ...source, evidence_url: raw_ref };
      const { data } = await supabaseAdmin.storage
        .from("bio-sources")
        .createSignedUrl(raw_ref, 60 * 60);
      return { ...source, evidence_url: data?.signedUrl || null };
    }
    return {
      ...source,
      evidence_url: /^https?:\/\//i.test(source.src || "") ? source.src : null,
    };
  }));

  return c.json({
    job,
    focus: computeFocus(job?.bio?.payload || {}),
    sources: reviewableSources,
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
    const { data: result, error: reviewErr } = await supabaseAdmin.rpc("review_steward_job_atomic", {
      p_job_id: jobId,
      p_lead_id: steward.id,
      p_approve: body.leadApprove,
      p_notes: body.leadNotes || null,
    });
    if (reviewErr) return c.json({ error: reviewErr.message }, 409);
    if (body.leadApprove) {
      await notify({
        recipientUserId: await brandOwnerUserId(job.brand_id),
        kind: "steward.certified",
        title: "Your brand BIO is certified",
        body: "A senior reviewer certified your Brand Intelligence Object.",
        link: "#/home",
        brandId: job.brand_id,
      });
    }
    return c.json({
      ok: true,
      status: result?.status,
      action: result?.action,
      certifiedBioId: result?.bio_id,
      certifiedVersion: result?.version,
      leadReviewedBy: body.leadApprove ? { id: steward.id, name: steward.name } : null,
    });
  }

  /* ─── Steward submission path ─────────────────────────────────── */
  const status = body.status;
  if (!["completed", "cancelled"].includes(status)) {
    return c.json({ error: "status must be 'completed' or 'cancelled'" }, 400);
  }

  if (job.assigned_to && job.assigned_to !== steward.id) {
    return c.json({ error: "Job assigned to another Steward" }, 403);
  }
  let candidatePayload = null;
  if (body.bioPatch && typeof body.bioPatch === "object" && !Array.isArray(body.bioPatch)) {
    const { data: sourceBio, error: bioErr } = await supabaseAdmin
      .from("bios").select("payload").eq("id", job.bio_id).maybeSingle();
    if (bioErr || !sourceBio) return c.json({ error: "Candidate BIO not found" }, 404);
    candidatePayload = mergeBioPayload(sourceBio.payload, body.bioPatch);
  }
  const { data: result, error: submitErr } = await supabaseAdmin.rpc("submit_steward_job_atomic", {
    p_job_id: jobId,
    p_steward_id: steward.id,
    p_is_lead: isLead,
    p_calibration: calibration,
    p_status: status,
    p_candidate_payload: candidatePayload,
    p_candidate_score: candidatePayload ? scoreBio(candidatePayload) : null,
    p_notes: body.notes || null,
  });
  if (submitErr) return c.json({ error: submitErr.message }, 409);

  if (result?.certified) {
    await notify({
      recipientUserId: await brandOwnerUserId(job.brand_id),
      kind: "steward.certified",
      title: "Your brand BIO is certified",
      body: "A senior reviewer certified your Brand Intelligence Object.",
      link: "#/home",
      brandId: job.brand_id,
    });
  }

  return c.json({
    ok: true,
    status: result?.status,
    certifiedBioId: result?.bio_id,
    certifiedVersion: result?.version,
    certifiedBy: result?.certified ? { id: steward.id, name: steward.name } : null,
    needsLeadApproval: !!result?.needs_lead_approval,
  });
});

export default app;

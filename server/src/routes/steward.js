// ─────────────────────────────────────────────────────────────────────
// Steward operation — backend routes (stage-2 human certification).
//
// GET   /api/steward/jobs            → list jobs visible to caller
// GET   /api/steward/jobs/:id        → one job + candidate BIO + rubric + auto-signals
// PATCH /api/steward/jobs/:id        → submit a certification DECISION (or Lead approve)
// POST  /api/steward/decertify       → decertify a certified BIO (Lead proposes / super_admin finalizes)
//
// The decision is computed by the PURE rubric engine (evaluate-certification.js)
// from the reviewer's anchored scores + the BIO's auto-signals — the reviewer
// scores criteria, the rubric decides the band, and every decision event is
// written append-only to cert_decisions so "why?" reconstructs from the system.
//
// Role gate: caller must have a `team_members` row with 'steward' or
// 'lead_steward' in roles[]. Decert also allows users.role='super_admin'.
// ─────────────────────────────────────────────────────────────────────

import { Hono } from "hono";
import { requireAuth } from "../middleware/auth.js";
import { supabaseAdmin } from "../lib/supabase.js";
import { computeFocus } from "../lib/bio-focus.js";
import { scoreBio, scoreBioBreakdown } from "../lib/score-bio.js";
import { evaluateCertification, DEFAULT_RUBRIC } from "../lib/evaluate-certification.js";
import { payloadHash } from "../lib/bio-hash.js";
import { deepMerge } from "../lib/deep-merge.js";
import { normalizeBioEvidence } from "../lib/bio-evidence.js";
import { notify, brandOwnerUserId } from "../lib/notify.js";

const app = new Hono();
const CERT_TTL_DAYS = Number(process.env.CERT_TTL_DAYS || 180);
const ttlFromNow = () => new Date(Date.now() + CERT_TTL_DAYS * 86400000).toISOString();

async function loadActiveRubric() {
  const { data } = await supabaseAdmin
    .from("cert_rubric_versions").select("id, config").eq("active", true).maybeSingle();
  return data ? { id: data.id, config: data.config } : { id: null, config: DEFAULT_RUBRIC };
}

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

async function requireSteward(c, next) {
  const { userId } = c.get("auth");
  const steward = await getCallerSteward(userId);
  if (!steward) return c.json({ error: "Steward role required" }, 403);
  c.set("steward", steward);
  await next();
}

/* GET /api/steward/jobs — jobs visible to the caller (queued/in_review/pending,
   assigned to caller or unassigned so they can claim one). */
app.get("/jobs", requireAuth, requireSteward, async (c) => {
  const steward = c.get("steward");
  const { data, error } = await supabaseAdmin
    .from("steward_jobs")
    .select(`
      id, bio_id, brand_id, kind, status, decision, assigned_to,
      outputs_reviewed_count, override_reason, credits_charged,
      queued_at, completed_at,
      brand:brands ( id, name, url )
    `)
    .in("status", ["queued", "in_review", "pending_lead_review", "changes_requested"])
    .or(`assigned_to.eq.${steward.id},assigned_to.is.null`)
    .order("queued_at", { ascending: true });

  if (error) return c.json({ error: error.message }, 500);
  return c.json({ jobs: data, you: { id: steward.id, name: steward.name, roles: steward.roles } });
});

/* GET /api/steward/jobs/:id — full job + candidate BIO + the active rubric and
   pre-computed auto-signals, so the reviewer UI can render the scoring form. */
app.get("/jobs/:id", requireAuth, requireSteward, async (c) => {
  const steward = c.get("steward");
  const jobId = c.req.param("id");
  const { data: job, error } = await supabaseAdmin
    .from("steward_jobs")
    .select(`
      id, bio_id, brand_id, kind, status, decision, assigned_to, override_reason, queued_at,
      lead_reviewed_by, lead_reviewed_at,
      bio:bios ( id, version, payload, score, certified, certified_by, certified_at, self_certified, created_at ),
      brand:brands ( id, name, url, industry )
    `)
    .eq("id", jobId)
    .maybeSingle();
  if (error || !job) return c.json({ error: error?.message || "Not found" }, 404);

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
  const rubric = await loadActiveRubric();
  const autoSignals = scoreBioBreakdown(job?.bio?.payload || {});

  return c.json({
    job,
    focus: computeFocus(job?.bio?.payload || {}),
    sources: reviewableSources,
    rubric: rubric.config,
    autoSignals: { coverage: autoSignals.coverage, avgConf: autoSignals.avgConf, sourceDiversity: autoSignals.sourceDiversity },
    you: { id: steward.id, name: steward.name, first_name: steward.first_name, roles: steward.roles },
  });
});

/* PATCH /api/steward/jobs/:id
   Steward submission:
     { reviewerScores: {C3:{score,confidence},...}, bioPatch?, notes?,
       conditions?, required_changes?, reject_reason_code? }
   Lead approval of a pending_lead_review job:
     { leadApprove: true|false, leadNotes? }
   Cancel:
     { status: "cancelled" }
*/
app.patch("/jobs/:id", requireAuth, requireSteward, async (c) => {
  const steward = c.get("steward");
  const isLead = (steward.roles || []).includes("lead_steward");
  const calibration = (process.env.STEWARD_CALIBRATION_REQUIRED || "true").toLowerCase() !== "false";
  const jobId = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));

  const { data: job, error: jobErr } = await supabaseAdmin
    .from("steward_jobs")
    .select("id, bio_id, brand_id, kind, status, assigned_to, rubric_version_id, decision, composite_score")
    .eq("id", jobId)
    .maybeSingle();
  if (jobErr || !job) return c.json({ error: "Job not found" }, 404);
  if (["completed", "rejected", "decertified"].includes(job.status)) {
    return c.json({ error: `Job is ${job.status}` }, 409);
  }

  /* ─── Lead approval path (finalizes a pending calibration) ──────────── */
  if (typeof body.leadApprove === "boolean") {
    if (!isLead) return c.json({ error: "Lead Steward role required to approve calibration" }, 403);
    if (job.status !== "pending_lead_review") return c.json({ error: `Job is ${job.status}, not pending_lead_review` }, 409);
    // Four-eyes: a Lead cannot approve their own submission.
    if (job.assigned_to === steward.id) return c.json({ error: "You submitted this — a different Lead must review it (four-eyes)." }, 409);

    const { data: bioRow, error: bioErr } = await supabaseAdmin
      .from("bios").select("id, version, payload").eq("id", job.bio_id).single();
    if (bioErr || !bioRow) return c.json({ error: "Candidate BIO not found" }, 404);

    if (body.leadApprove === false) {
      await supabaseAdmin.from("steward_jobs").update({
        status: "changes_requested",
        lead_reviewed_by: steward.id,
        lead_reviewed_at: new Date().toISOString(),
        override_reason: body.leadNotes ? `lead_reject: ${body.leadNotes}` : "lead_reject",
      }).eq("id", jobId);
      await writeDecision({ job, bioRow, actor: steward, actorRole: "lead_steward", decision: "return_changes", narrative: body.leadNotes });
      return c.json({ ok: true, status: "changes_requested", action: "sent_back" });
    }

    await supabaseAdmin.from("bios").update({
      certified: true,
      certified_by: job.assigned_to,
      certified_at: new Date().toISOString(),
      cert_kind: job.kind,
      cert_valid_until: ttlFromNow(),
    }).eq("id", job.bio_id);
    await supabaseAdmin.from("steward_jobs").update({
      status: "completed",
      completed_at: new Date().toISOString(),
      lead_reviewed_by: steward.id,
      lead_reviewed_at: new Date().toISOString(),
    }).eq("id", jobId);
    await writeDecision({ job, bioRow, actor: steward, actorRole: "lead_steward", decision: job.decision || "approve", narrative: body.leadNotes });
    await notifyCertified(job.brand_id);
    return c.json({ ok: true, status: "completed", action: "approved", certifiedVersion: bioRow.version });
  }

  /* ─── Cancel ────────────────────────────────────────────────────────── */
  if (body.status === "cancelled") {
    if (job.assigned_to && job.assigned_to !== steward.id) return c.json({ error: "Job assigned to another Steward" }, 403);
    await supabaseAdmin.from("steward_jobs").update({ status: "cancelled", completed_at: new Date().toISOString() }).eq("id", jobId);
    return c.json({ ok: true, status: "cancelled" });
  }

  /* ─── Steward submission (four decisions via the rubric engine) ──────── */
  // Separation of duties (P3 H1): a reviewer may not review/certify a brand
  // they own (the client who self-certifies). Hard gate at the decision point,
  // independent of the assignment-time rotation rule.
  const ownerUserId = await brandOwnerUserId(job.brand_id);
  if (ownerUserId && ownerUserId === c.get("auth").userId) {
    return c.json({ error: "Separation of duties: you can't review a brand you own.", code: "SOD_OWN_BRAND" }, 403);
  }

  // Claim the job.
  if (!job.assigned_to) {
    await supabaseAdmin.from("steward_jobs").update({ assigned_to: steward.id, status: "in_review" }).eq("id", jobId);
    job.assigned_to = steward.id;
  } else if (job.assigned_to !== steward.id) {
    return c.json({ error: "Job assigned to another Steward" }, 403);
  }

  const { data: bio, error: bioErr } = await supabaseAdmin
    .from("bios").select("id, payload, version, brand_id").eq("id", job.bio_id).single();
  if (bioErr || !bio) return c.json({ error: "Candidate BIO not found" }, 404);

  // The route owns recursive BIO patch semantics. Arrays replace and nested
  // objects merge without dropping untouched evidence-backed fields.
  const hasBioPatch = body.bioPatch && typeof body.bioPatch === "object" && !Array.isArray(body.bioPatch);
  const workingPayload = hasBioPatch
    ? normalizeBioEvidence(deepMerge(bio.payload || {}, body.bioPatch))
    : (bio.payload || {});
  let targetBioId = bio.id;
  let targetVersion = bio.version;

  // Evaluate the rubric.
  const rubric = await loadActiveRubric();
  const bd = scoreBioBreakdown(workingPayload);
  const autoSignals = { coverage: bd.coverage, avgConf: bd.avgConf, sourceDiversity: bd.sourceDiversity };
  const result = evaluateCertification({ autoSignals, reviewerScores: body.reviewerScores || {}, rubricConfig: rubric.config });
  if (result.incomplete) {
    return c.json({ error: "Score every human criterion before submitting", missingScores: result.missingScores }, 400);
  }

  const decision = result.recommendedDecision;                 // approve | approve_with_conditions | return_changes | reject
  const approves = decision === "approve" || decision === "approve_with_conditions";
  const needsLeadApproval = calibration && !isLead && approves;  // non-Lead approvals go to calibration
  const finalCertified = approves && !needsLeadApproval;

  if (hasBioPatch) {
    // Version allocation stays serialized even though the richer rubric and
    // append-only audit flow remain authoritative for certification state.
    const { data: appended, error: appendErr } = await supabaseAdmin.rpc("append_bio_version", {
      p_brand_id: bio.brand_id,
      p_payload: workingPayload,
      p_score: scoreBio(workingPayload),
      p_created_by: null,
      p_discovery_id: null,
    });
    if (appendErr || !appended) return c.json({ error: appendErr?.message || "BIO version append failed" }, 500);
    targetBioId = appended.id;
    targetVersion = appended.version;
  }

  await supabaseAdmin.from("bios").update({
    certified: finalCertified,
    certified_by: finalCertified ? steward.id : null,
    certified_at: finalCertified ? new Date().toISOString() : null,
    cert_kind: finalCertified ? job.kind : null,
    cert_valid_until: finalCertified ? ttlFromNow() : null,
    steward_notes: body.notes || null,
  }).eq("id", targetBioId);

  const newStatus =
    needsLeadApproval ? "pending_lead_review" :
    decision === "return_changes" ? "changes_requested" :
    decision === "reject" ? "rejected" :
    "completed";

  await supabaseAdmin.from("steward_jobs").update({
    bio_id: targetBioId,
    status: newStatus,
    decision,
    composite_score: result.composite,
    rubric_version_id: rubric.id,
    conditions: decision === "approve_with_conditions" ? (body.conditions || []) : null,
    required_changes: decision === "return_changes" ? (body.required_changes || []) : null,
    reject_reason_code: decision === "reject" ? (body.reject_reason_code || "unspecified") : null,
    completed_at: (finalCertified || decision === "reject") ? new Date().toISOString() : null,
    assigned_to: steward.id,
  }).eq("id", jobId);

  await writeDecision({
    job: { ...job, bio_id: targetBioId },
    bioRow: { id: targetBioId, version: targetVersion, payload: workingPayload },
    actor: steward,
    actorRole: isLead ? "lead_steward" : "steward",
    decision,
    result,
    autoSignals,
    rubricId: rubric.id,
    conditions: body.conditions,
    requiredChanges: body.required_changes,
    rejectReasonCode: body.reject_reason_code,
    narrative: body.notes,
  });

  if (finalCertified) await notifyCertified(job.brand_id);

  /* Steward ↔ client review loop — surface the reviewer's verdict for the
     decisions that never reached the client before. Skip the calibration
     interim (pending_lead_review): an approve_with_conditions isn't final
     until a Lead signs off, and the client is notified from that path then.
     return_changes / reject are never lead-gated, so they always fire. */
  if (!needsLeadApproval && ["return_changes", "reject", "approve_with_conditions"].includes(decision)) {
    const recipientUserId = await brandOwnerUserId(job.brand_id);
    if (decision === "return_changes") {
      await notify({
        recipientUserId,
        kind: "steward.changes_requested",
        title: "Your Steward requested changes",
        body: "A senior reviewer returned your brand BIO with required changes. Open your BIO to see what to address.",
        link: "#/bio",
        brandId: job.brand_id,
      });
    } else if (decision === "reject") {
      await notify({
        recipientUserId,
        kind: "steward.rejected",
        title: "Your brand BIO could not be certified",
        body: "A senior reviewer could not certify this version. Open your BIO to see why and what to change.",
        link: "#/bio",
        brandId: job.brand_id,
      });
    } else {
      await notify({
        recipientUserId,
        kind: "steward.conditions",
        title: "Your brand BIO is certified with conditions",
        body: "A senior reviewer certified your BIO with conditions to address. Open your BIO to see them.",
        link: "#/bio",
        brandId: job.brand_id,
      });
    }
  }

  return c.json({
    ok: true,
    status: newStatus,
    decision,
    composite: result.composite,
    band: result.band,
    gateFailures: result.gateFailures,
    needsCalibration: result.needsCalibration,
    certifiedVersion: finalCertified ? targetVersion : null,
    needsLeadApproval,
  });
});

/* POST /api/steward/decertify — pull a certified BIO's certification.
   Authority: super_admin (users.role) or lead_steward. In-flight policy is
   enforced by the gate itself: new/queued production blocks immediately
   (loadBioForRun now fails), already-running jobs finish (they pinned
   bio_version), completed outputs keep their chip, briefing stays up
   (self-cert is untouched). */
app.post("/decertify", requireAuth, async (c) => {
  const auth = c.get("auth");
  const steward = await getCallerSteward(auth.userId);
  const isLead = (steward?.roles || []).includes("lead_steward");
  const isSuper = auth.role === "super_admin";
  if (!isLead && !isSuper) return c.json({ error: "Lead Steward or super_admin required" }, 403);

  const body = await c.req.json().catch(() => ({}));
  const brandId = body.brandId;
  const reasonCode = body.reason_code || "unspecified";
  if (!brandId) return c.json({ error: "brandId required" }, 400);

  // Target the currently-certified version.
  const { data: bio } = await supabaseAdmin
    .from("bios")
    .select("id, version, payload, brand_id, certified")
    .eq("brand_id", brandId).eq("certified", true)
    .order("version", { ascending: false }).limit(1).maybeSingle();
  if (!bio) return c.json({ error: "No certified BIO for this brand" }, 404);

  await supabaseAdmin.from("bios").update({
    certified: false, cert_valid_until: null,
    steward_notes: body.notes ? `DECERTIFIED: ${body.notes}` : "DECERTIFIED",
  }).eq("id", bio.id);

  await writeDecision({
    job: { id: null, brand_id: brandId, bio_id: bio.id },
    bioRow: bio,
    actor: steward || { id: null, name: auth.email },
    actorRole: isSuper ? "super_admin" : "lead_steward",
    decision: "decertify",
    rejectReasonCode: reasonCode,
    narrative: body.notes,
  });

  // Enqueue a re-review so the brand can recover.
  const { data: sj } = await supabaseAdmin
    .from("steward_jobs").insert({ bio_id: bio.id, brand_id: brandId, kind: "drift_check", status: "queued" }).select("id").maybeSingle();
  if (sj?.id) {
    try { const { assignSteward } = await import("../lib/assign-steward.js"); await assignSteward(sj.id); } catch (e) { /* best-effort */ }
  }

  await notify({
    recipientUserId: await brandOwnerUserId(brandId),
    kind: "steward.decertified",
    title: "Your brand BIO was decertified",
    body: "Production is paused until it is re-certified. Briefing stays available.",
    link: "#/bio",
    brandId,
  });

  return c.json({ ok: true, decertifiedVersion: bio.version });
});

/* Append-only decision record — every decision EVENT (submit, lead-approve,
   send-back, decertify) is one immutable row. This is what makes "why?"
   answerable from the system rather than a person. */
async function writeDecision({ job, bioRow, actor, actorRole, decision, result, autoSignals, rubricId, conditions, requiredChanges, rejectReasonCode, narrative }) {
  const focus = computeFocus(bioRow?.payload || {});
  await supabaseAdmin.from("cert_decisions").insert({
    steward_job_id: job?.id || null,
    bio_id: bioRow?.id || job?.bio_id || null,
    brand_id: job?.brand_id || null,
    actor_id: actor?.id || null,
    actor_role: actorRole,
    decision,
    rubric_version_id: rubricId || null,
    composite_score: result?.composite ?? null,
    band: result?.band ?? null,
    criterion_scores: result?.breakdown ?? null,
    gate_failures: result?.gateFailures ?? null,
    auto_signals: autoSignals ?? null,
    focus_unaddressed: focus,
    conditions: conditions ?? null,
    required_changes: requiredChanges ?? null,
    reject_reason_code: rejectReasonCode ?? null,
    narrative: narrative ?? null,
    bio_payload_hash: payloadHash(bioRow?.payload || {}),
  });
}

async function notifyCertified(brandId) {
  await notify({
    recipientUserId: await brandOwnerUserId(brandId),
    kind: "steward.certified",
    title: "Your brand BIO is certified",
    body: "A senior reviewer certified your Brand Intelligence Object.",
    link: "#/home",
    brandId,
  });
}

export default app;

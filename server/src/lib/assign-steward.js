// ─────────────────────────────────────────────────────────────────────
// P1.5-002 — Steward assignment, rotation + capacity fallback.
//
// Picks a Steward for a queued steward_jobs row using:
//   1. Eligibility: team_members.active=true AND roles contains 'steward'
//   2. Rotation rule (rev-2 §5.1): a Steward never certifies a brand they
//      actively craft on. We don't have L3 crafting signal yet (P3+ work
//      when runs.team_assignments lands); left as a TODO below.
//   3. Round-robin: pick the eligible Steward with the *least recent*
//      assignment so no one Steward gets all jobs.
//   4. Capacity fallback (rev-2 §5.1): if no Steward is eligible (PTO,
//      rotation exclusion, none seeded), promote to a Lead Steward and
//      log `override_reason='rotation_exhausted_fallback_to_lead'`.
//   5. Last resort: leave unassigned + log `no_eligible_steward_or_lead`.
//
// Returns { assignedTo, name, override }.
// ─────────────────────────────────────────────────────────────────────

import { supabaseAdmin } from "./supabase.js";
import { notify } from "./notify.js";

export async function assignSteward(stewardJobId) {
  const { data: job, error: jobErr } = await supabaseAdmin
    .from("steward_jobs")
    .select("id, brand_id, kind")
    .eq("id", stewardJobId)
    .maybeSingle();
  if (jobErr) throw new Error(`assignSteward: load job failed — ${jobErr.message}`);
  if (!job) throw new Error(`assignSteward: job ${stewardJobId} not found`);

  /* 1. Eligible Stewards. */
  let { data: stewards } = await supabaseAdmin
    .from("team_members")
    .select("id, first_name, user_id")
    .contains("roles", ["steward"])
    .eq("active", true)
    .not("user_id", "is", null); // must have a login: they need to be notified AND certify

  /* 2. Rotation rule (rev-2 §5.1): a Steward never certifies a brand they
     craft on. Exclude any Steward whose user id appears as a craft deliverer
     on one of this brand's outputs. If that empties the pool, the capacity
     fallback below routes to a Lead. */
  if (stewards && stewards.length) {
    const { data: briefRows } = await supabaseAdmin.from("briefs").select("id").eq("brand_id", job.brand_id);
    const briefIds = (briefRows || []).map((b) => b.id);
    if (briefIds.length) {
      const { data: outs } = await supabaseAdmin.from("outputs").select("body").in("brief_id", briefIds);
      const crafters = new Set();
      for (const o of outs || []) {
        const dels = o.body?.deliverables;
        if (Array.isArray(dels)) for (const d of dels) if (d?.craft?.delivered_by) crafters.add(d.craft.delivered_by);
      }
      if (crafters.size) stewards = stewards.filter((s) => !crafters.has(s.user_id));
    }
  }

  if (stewards && stewards.length > 0) {
    /* 3. Round-robin by least-recent assignment.
       Build a map of steward_id → most-recent queued_at; sort ascending so
       the Steward who hasn't been assigned in the longest goes first. New
       Stewards (never assigned) sort to the very front. */
    const ids = stewards.map((s) => s.id);
    const { data: recent } = await supabaseAdmin
      .from("steward_jobs")
      .select("assigned_to, queued_at")
      .in("assigned_to", ids)
      .order("queued_at", { ascending: false });

    const lastSeen = new Map();
    for (const r of recent || []) {
      if (r.assigned_to && !lastSeen.has(r.assigned_to)) lastSeen.set(r.assigned_to, r.queued_at);
    }
    const chosen = [...stewards].sort((a, b) => {
      const aT = lastSeen.get(a.id) || "1970-01-01";
      const bT = lastSeen.get(b.id) || "1970-01-01";
      return new Date(aT) - new Date(bT);
    })[0];

    const { error: updErr } = await supabaseAdmin
      .from("steward_jobs")
      .update({ assigned_to: chosen.id })
      .eq("id", stewardJobId);
    if (updErr) throw new Error(`assignSteward: update failed — ${updErr.message}`);

    await notify({
      recipientUserId: chosen.user_id,
      kind: "steward.assigned",
      title: "A BIO is queued for your certification",
      body: "You've been assigned a Brand Intelligence Object to certify.",
      link: "#/team",
      brandId: job.brand_id,
    });
    return { assignedTo: chosen.id, name: chosen.first_name, override: null };
  }

  /* 4. Capacity fallback — promote to a Lead Steward. */
  const { data: leads } = await supabaseAdmin
    .from("team_members")
    .select("id, first_name, user_id")
    .contains("roles", ["lead_steward"])
    .eq("active", true)
    .not("user_id", "is", null)
    .order("created_at", { ascending: true })
    .limit(1);

  if (leads && leads.length > 0) {
    const lead = leads[0];
    await supabaseAdmin
      .from("steward_jobs")
      .update({ assigned_to: lead.id, override_reason: "rotation_exhausted_fallback_to_lead" })
      .eq("id", stewardJobId);
    await notify({
      recipientUserId: lead.user_id,
      kind: "steward.assigned",
      title: "A BIO is queued for your certification",
      body: "A certification was routed to you (rotation fallback).",
      link: "#/team",
      brandId: job.brand_id,
    });
    return { assignedTo: lead.id, name: lead.first_name, override: "rotation_exhausted_fallback_to_lead" };
  }

  /* 5. No one available. */
  await supabaseAdmin
    .from("steward_jobs")
    .update({ override_reason: "no_eligible_steward_or_lead" })
    .eq("id", stewardJobId);
  return { assignedTo: null, name: null, override: "no_eligible_steward_or_lead" };
}

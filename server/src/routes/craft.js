// /api/craft — human polish handoff ("send to human").
//
// No dedicated table: a craft job lives ON the deliverable itself, inside the
// output row's JSONB at body.deliverables[slot].craft, plus a real ledger
// debit. This makes the handoff PERSIST (the canvas view reads it straight
// from the output) with no schema migration. A dedicated craft_jobs table can
// replace this later for cleaner queue queries.
//
//   POST   /api/craft           { outputId, slot, notes }   → contract a human
//   GET    /api/craft/queue                                 → pending jobs (Team)
//   PATCH  /api/craft/deliver   { outputId, slot, body }    → human returns polish

import { Hono } from "hono";
import { requireAuth } from "../middleware/auth.js";
import { supabaseAdmin } from "../lib/supabase.js";
import { assertCreditsAvailable, creditErrorResponse } from "../lib/credits.js";
import { craftEnabled } from "../lib/plan-limits.js";
import { notify, notifyTeamRole } from "../lib/notify.js";

const app = new Hono();
const POLISH_CR = 40;

async function loadOutput(outputId) {
  const { data, error } = await supabaseAdmin
    .from("outputs")
    .select("id, body, brief_id, brief:briefs ( id, title, brand_id, brand:brands ( workspace_id, name ) )")
    .eq("id", outputId)
    .maybeSingle();
  return { output: data, error };
}

async function requireCraftTeam(c, next) {
  const auth = c.get("auth");
  if (auth?.role === "admin") {
    await next();
    return;
  }

  const { data } = await supabaseAdmin
    .from("team_members")
    .select("id, roles, active")
    .eq("user_id", auth.userId)
    .maybeSingle();
  const roles = data?.roles || [];
  const allowed = data?.active && roles.some((r) => r === "craft" || r === "steward" || r === "lead_steward");
  if (!allowed) return c.json({ error: "Craft team role required" }, 403);
  c.set("craftMember", data);
  await next();
}

/* POST /api/craft — contract a human to polish ONE deliverable. */
app.post("/", requireAuth, async (c) => {
  const { workspaceId, userId } = c.get("auth");
  const payload = await c.req.json().catch(() => ({}));
  const { outputId, slot, notes } = payload || {};
  if (!outputId || slot == null) return c.json({ error: "outputId and slot required" }, 400);

  const { output, error } = await loadOutput(outputId);
  if (error || !output) return c.json({ error: "Output not found" }, 404);
  if (output.brief?.brand?.workspace_id !== workspaceId) return c.json({ error: "Forbidden" }, 403);

  // Tier gate: human craft is a paid entitlement that unlocks at The River ('02') and up.
  const { data: ws } = await supabaseAdmin.from("workspaces").select("tier").eq("id", workspaceId).maybeSingle();
  if (!craftEnabled(ws?.tier)) {
    return c.json({ error: "Human craft is available from The River and up.", code: "CRAFT_TIER_LOCKED", minTier: "02" }, 403);
  }

  const ob = output.body || {};
  const deliverables = Array.isArray(ob.deliverables) ? [...ob.deliverables] : null;
  if (!deliverables || !deliverables[slot]) return c.json({ error: "Deliverable not found at slot" }, 404);
  if (deliverables[slot]?.craft && deliverables[slot].craft.status !== "cancelled") {
    return c.json({ error: "Deliverable is already in human craft", code: "CRAFT_ALREADY_REQUESTED" }, 409);
  }

  const creditCheck = await assertCreditsAvailable(workspaceId, POLISH_CR);
  if (!creditCheck.ok) return creditErrorResponse(c, creditCheck);

  const nowIso = new Date().toISOString();
  deliverables[slot] = {
    ...deliverables[slot],
    craft: {
      status: "queued",
      notes: String(notes || "").slice(0, 2000),
      credits: POLISH_CR,
      requested_at: nowIso,
      requested_by: userId,
      delivered: null,
    },
  };

  const { error: updErr } = await supabaseAdmin
    .from("outputs").update({ body: { ...ob, deliverables } }).eq("id", outputId);
  if (updErr) return c.json({ error: updErr.message }, 500);

  const { error: ledgerErr } = await supabaseAdmin.from("ledger").insert({
    workspace_id: workspaceId,
    credits: POLISH_CR,
    kind: "craft",
    balance_after: creditCheck.balance - POLISH_CR,
  });
  if (ledgerErr) {
    await supabaseAdmin.from("outputs").update({ body: ob }).eq("id", outputId);
    return c.json({ error: ledgerErr.message }, 500);
  }

  await notifyTeamRole("craft", {
    kind: "craft.queued",
    title: "New craft job queued",
    body: "A deliverable is ready for human polish.",
    link: "#/team-craft",
    brandId: output.brief?.brand?.id || null,
  });

  return c.json({ ok: true, status: "queued", credits: POLISH_CR, craft: deliverables[slot].craft });
});

/* GET /api/craft/queue — pending craft jobs in the caller's workspace, flattened
   to one entry per in-flight deliverable. (Scans recent outputs; fine at this
   scale, swap for a craft_jobs table if volume grows.) */
app.get("/queue", requireAuth, requireCraftTeam, async (c) => {
  const { workspaceId } = c.get("auth");
  const { data: rows } = await supabaseAdmin
    .from("outputs")
    .select("id, body, created_at, brief:briefs ( id, title, brand_id, brand:brands ( workspace_id, name ) )")
    .order("created_at", { ascending: false })
    .limit(500);

  const jobs = [];
  for (const o of rows || []) {
    if (o.brief?.brand?.workspace_id !== workspaceId) continue;
    const dels = o.body?.deliverables;
    if (!Array.isArray(dels)) continue;
    dels.forEach((d, slot) => {
      if (d?.craft && (d.craft.status === "queued" || d.craft.status === "in_craft")) {
        jobs.push({
          outputId: o.id, slot,
          brand: o.brief?.brand?.name || "", briefId: o.brief?.id, briefTitle: o.brief?.title || "",
          title: d.title || "", body: d.body || "", platform: d.platform || "generic",
          notes: d.craft.notes || "", status: d.craft.status, credits: d.craft.credits || POLISH_CR,
          requested_at: d.craft.requested_at,
        });
      }
    });
  }
  jobs.sort((a, b) => (a.requested_at < b.requested_at ? 1 : -1));
  return c.json({ jobs });
});

/* PATCH /api/craft/deliver — a human returns the polished version. */
app.patch("/deliver", requireAuth, requireCraftTeam, async (c) => {
  const { workspaceId, userId } = c.get("auth");
  const payload = await c.req.json().catch(() => ({}));
  const { outputId, slot } = payload || {};
  if (!outputId || slot == null) return c.json({ error: "outputId and slot required" }, 400);

  const { output, error } = await loadOutput(outputId);
  if (error || !output) return c.json({ error: "Output not found" }, 404);
  if (output.brief?.brand?.workspace_id !== workspaceId) return c.json({ error: "Forbidden" }, 403);

  const ob = output.body || {};
  const deliverables = Array.isArray(ob.deliverables) ? [...ob.deliverables] : null;
  const d = deliverables?.[slot];
  if (!d?.craft) return c.json({ error: "No craft job at that slot" }, 404);

  const nowIso = new Date().toISOString();
  const polishedBody = typeof payload.body === "string" && payload.body.trim() ? payload.body : d.body;
  deliverables[slot] = {
    ...d,
    body: polishedBody,
    assetUrl: payload.asset_url || d.assetUrl || null,
    status: "approved",
    craft: {
      ...d.craft,
      status: "delivered",
      delivered_at: nowIso,
      delivered_by: userId,
      delivered: { body: polishedBody, asset_url: payload.asset_url || null },
    },
  };

  const { error: updErr } = await supabaseAdmin
    .from("outputs").update({ body: { ...ob, deliverables } }).eq("id", outputId);
  if (updErr) return c.json({ error: updErr.message }, 500);

  await notify({
    recipientUserId: d.craft.requested_by,
    kind: "craft.delivered",
    title: "Your polish is ready",
    body: "A specialist deliverable has been refined by our team.",
    link: "#/library",
    brandId: output.brief?.brand?.id || null,
  });

  return c.json({ ok: true, status: "delivered", deliverable: deliverables[slot] });
});

export default app;

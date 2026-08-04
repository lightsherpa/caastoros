// ─────────────────────────────────────────────────────────────────────
// /api/team — read surfaces for the internal Team portal (capacity,
// client roster, my desk).
//
// Every number here is cross-workspace: a Steward serves all clients, but
// brands/bios/steward_jobs are behind workspace-isolation RLS, so a browser
// query would silently return only the team member's OWN workspace. Hence
// supabaseAdmin behind a role gate — same shape as /api/steward.
// ─────────────────────────────────────────────────────────────────────

import { Hono } from "hono";
import { requireAuth } from "../middleware/auth.js";
import { supabaseAdmin } from "../lib/supabase.js";

const app = new Hono();
const OPEN = ["queued", "in_review", "pending_lead_review"];
const DAYS = 14;

/* Any active team member (craft or steward) works this portal; admins too. */
async function requireTeam(c, next) {
  const auth = c.get("auth");
  const { data } = await supabaseAdmin
    .from("team_members")
    .select("id, name, first_name, roles, active")
    .eq("user_id", auth.userId)
    .maybeSingle();
  const member = data?.active ? data : null;
  if (!member && auth.role !== "admin") return c.json({ error: "Team role required" }, 403);
  c.set("teamMember", member);
  await next();
}

app.get("/overview", requireAuth, requireTeam, async (c) => {
  const me = c.get("teamMember");
  /* Start of the first day in the throughput window — today is the last bucket. */
  const dayZero = new Date(); dayZero.setHours(0, 0, 0, 0);
  dayZero.setDate(dayZero.getDate() - (DAYS - 1));

  const [members, brands, bios, open, done, mine] = await Promise.all([
    /* No active filter: the name map must still resolve a Steward who has
       since been deactivated, otherwise their certifications read as
       "Not certified" and a real human loses credit for work they signed.
       The roster below filters to active. */
    supabaseAdmin.from("team_members").select("id, name, roles, active").order("name"),
    supabaseAdmin.from("brands").select("id, name, url, created_at, workspace:workspaces ( tier )").order("name"),
    supabaseAdmin.from("bios").select("brand_id, version, score, certified, certified_by, certified_at, created_at").order("version", { ascending: false }),
    supabaseAdmin.from("steward_jobs").select("id, brand_id, kind, status, assigned_to, queued_at").in("status", OPEN).order("queued_at"),
    supabaseAdmin.from("steward_jobs").select("completed_at").eq("status", "completed").gte("completed_at", dayZero.toISOString()),
    me
      ? supabaseAdmin.from("steward_jobs").select("id, brand_id, kind, completed_at").eq("assigned_to", me.id).eq("status", "completed").order("completed_at", { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);

  const failed = [members, brands, bios, open, done, mine].find((r) => r.error);
  if (failed) return c.json({ error: failed.error.message }, 500);

  const brandName = Object.fromEntries((brands.data || []).map((b) => [b.id, b.name]));
  const memberName = Object.fromEntries((members.data || []).map((m) => [m.id, m.name]));

  /* Version-descending, first write per brand wins — so if PostgREST ever
     truncates the page we lose old versions, never the current one. */
  const latestBio = {};
  for (const b of bios.data || []) if (!latestBio[b.brand_id]) latestBio[b.brand_id] = b;

  const openByBrand = {}, openByMember = {};
  for (const j of open.data || []) {
    openByBrand[j.brand_id] = (openByBrand[j.brand_id] || 0) + 1;
    if (j.assigned_to) openByMember[j.assigned_to] = (openByMember[j.assigned_to] || 0) + 1;
  }

  /* Certifications completed per day, oldest → today. */
  const throughput = Array.from({ length: DAYS }, () => 0);
  for (const j of done.data || []) {
    const idx = Math.floor((new Date(j.completed_at) - dayZero) / 86_400_000);
    if (idx >= 0 && idx < DAYS) throughput[idx] += 1;
  }

  const clients = (brands.data || []).map((b) => {
    const bio = latestBio[b.id];
    return {
      id: b.id,
      name: b.name,
      url: b.url,
      tier: b.workspace?.tier || null,
      bioScore: bio?.score ?? null,
      bioVersion: bio?.version ?? null,
      certifiedBy: bio?.certified ? memberName[bio.certified_by] || null : null,
      certifiedAt: bio?.certified ? bio.certified_at : null,
      openJobs: openByBrand[b.id] || 0,
      lastActivity: bio?.created_at || b.created_at,
    };
  });

  const myJobs = mine.data || [];
  return c.json({
    you: me ? { id: me.id, name: me.name, roles: me.roles } : null,
    members: (members.data || []).filter((m) => m.active).map((m) => ({ id: m.id, name: m.name, roles: m.roles, openJobs: openByMember[m.id] || 0 })),
    clients,
    backlog: (open.data || []).filter((j) => !j.assigned_to).map((j) => ({ id: j.id, brand: brandName[j.brand_id] || null, kind: j.kind, queued_at: j.queued_at })),
    throughput,
    myCompleted: myJobs.length,
    myDeliveries: myJobs.slice(0, 8).map((j) => ({ id: j.id, brand: brandName[j.brand_id] || null, kind: j.kind, completed_at: j.completed_at })),
  });
});

export default app;

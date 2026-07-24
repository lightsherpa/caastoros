import { supabaseAdmin } from "./supabase.js";
import { inngest } from "./inngest.js";

/* Central notification dispatcher. Writes an in-app row (→ Supabase Realtime
   push) and/or emits an email event, gated by the recipient's per-channel
   prefs (default both on). Fire-and-forget: a delivery failure is logged and
   swallowed so it can never break the action that triggered it. */
export async function notify({ recipientUserId, kind, title, body = null, link = null, brandId = null }) {
  if (!recipientUserId) return; // no addressable recipient (e.g. team member with no login)
  try {
    const { data: pref } = await supabaseAdmin
      .from("notification_prefs")
      .select("in_app, email")
      .eq("user_id", recipientUserId)
      .maybeSingle();
    const inApp = pref?.in_app ?? true;
    const email = pref?.email ?? true;

    if (inApp) {
      await supabaseAdmin
        .from("notifications")
        .insert({ user_id: recipientUserId, kind, title, body, link, brand_id: brandId });
    }
    if (email) {
      // Async via Inngest — never send inline (esp. from the runs SSE stream).
      await inngest.send({ name: "notification/email", data: { recipientUserId, kind, title, body, link } });
    }
  } catch (err) {
    console.error("notify() failed:", kind, err?.message);
  }
}

/* Resolve a brand's client recipient = the workspace's owner (earliest user).
   ponytail: notifies the account owner, not every collaborator in the
   workspace — revisit if shared workspaces need broadcast. */
export async function brandOwnerUserId(brandId) {
  if (!brandId) return null;
  const { data: brand } = await supabaseAdmin
    .from("brands").select("workspace_id").eq("id", brandId).maybeSingle();
  if (!brand?.workspace_id) return null;
  const { data: owner } = await supabaseAdmin
    .from("users").select("id")
    .eq("workspace_id", brand.workspace_id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return owner?.id || null;
}

/* Notify every team member holding a role (e.g. 'craft', 'steward') who has a
   linked login. Used for queue events with no single assignee yet. */
export async function notifyTeamRole(role, payload) {
  const { data: members } = await supabaseAdmin
    .from("team_members")
    .select("user_id")
    .contains("roles", [role])
    .not("user_id", "is", null);
  const seen = new Set();
  const targets = [];
  for (const m of members || []) {
    if (m.user_id && !seen.has(m.user_id)) { seen.add(m.user_id); targets.push(m.user_id); }
  }
  await Promise.all(targets.map((id) => notify({ ...payload, recipientUserId: id })));
}

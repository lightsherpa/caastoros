import { Hono } from "hono";
import { requireAuth } from "../middleware/auth.js";
import { supabaseAdmin } from "../lib/supabase.js";
import { serializeAuthorization } from "../lib/permissions.js";

const app = new Hono();
app.use("*", requireAuth);

app.get("/", async (c) => {
  const auth = c.get("auth");
  const { data: team } = await supabaseAdmin
    .from("team_members")
    .select("roles, name, avatar_url")
    .eq("user_id", auth.userId)
    .maybeSingle();
  return c.json({
    id: auth.userId,
    email: auth.email,
    legacyRole: auth.role,
    workspaceId: auth.workspaceId,
    ...serializeAuthorization(auth),
    qualifications: team?.roles || [],
    displayName: team?.name || null,
    avatarUrl: team?.avatar_url || null,
    assuranceLevel: auth.aal,
    mfaRequired: auth.mfaRequired,
    mfaSatisfied: auth.aal === "aal2",
  });
});

export default app;

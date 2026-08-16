// Hono middleware — extract Supabase JWT from Authorization header,
// validate via Supabase Auth, resolve users.workspace_id, attach as
// c.set("auth", { userId, email, workspaceId, role, jwt }).
// 401s if the header is missing or invalid.

import { supabaseAdmin } from "../lib/supabase.js";
import {
  decodeJwtClaims,
  hasPermission,
  loadAuthorizationContext,
  roleRequiresMfa,
} from "../lib/permissions.js";
import { requestIdFrom, writeAuthorizationAudit } from "../lib/audit.js";

export async function requireAuth(c, next) {
  const authz = c.req.header("authorization") || c.req.header("Authorization");
  const jwt = authz?.startsWith("Bearer ") ? authz.slice(7) : null;
  if (!jwt) return c.json({ error: "Missing Authorization: Bearer <jwt>" }, 401);

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(jwt);
  if (error || !user) return c.json({ error: `Invalid session: ${error?.message || "unknown"}` }, 401);

  // Look up the workspace_id + role for this user. The handle_new_auth_user
  // trigger ensures every auth.users row has a matching public.users row.
  const { data: row, error: rowErr } = await supabaseAdmin
    .from("users")
    .select("workspace_id, role, email")
    .eq("id", user.id)
    .maybeSingle();
  if (rowErr || !row) return c.json({ error: "User profile missing — sign up via the SPA first" }, 401);

  const authorization = await loadAuthorizationContext({
    userId: user.id,
    legacyRole: row.role,
    legacyWorkspaceId: row.workspace_id,
  });
  const claims = decodeJwtClaims(jwt);
  c.set("auth", {
    userId:      user.id,
    email:       row.email,
    workspaceId: row.workspace_id,
    role:        row.role,
    jwt,
    aal: claims.aal || "aal1",
    mfaRequired: roleRequiresMfa(authorization.persona),
    ...authorization,
  });
  await next();
}

/* Stricter gate — requires the user to carry role:'admin' in the
   `users` table. Use after requireAuth on any admin-only route. */
export function requirePermission(permission, options = {}) {
  return async (c, next) => {
    const auth = c.get("auth");
    const workspaceId = typeof options.workspaceId === "function" ? await options.workspaceId(c) : null;
    if (!hasPermission(auth, permission, workspaceId)) {
      await writeAuthorizationAudit({ auth, permission, action: c.req.method + " " + c.req.path, targetType: "route", workspaceId, outcome: "denied", requestId: requestIdFrom(c), reason: "permission_required" });
      return c.json({ error: "Forbidden", code: "PERMISSION_REQUIRED", permission }, 403);
    }
    if (options.mfa && auth.aal !== "aal2") {
      await writeAuthorizationAudit({ auth, permission, action: c.req.method + " " + c.req.path, targetType: "route", workspaceId, outcome: "denied", requestId: requestIdFrom(c), reason: "aal2_required" });
      return c.json({ error: "Multi-factor authentication required", code: "MFA_REQUIRED" }, 403);
    }
    await next();
  };
}

export async function requireAdmin(c, next) {
  return requirePermission("platform.specs.manage")(c, next);
}

/* Review-hierarchy authority above admin: decertification, reviewer-of-
   reviewers, cross-tenant ops. Powers are wired to routes in M2. */
export async function requireSuperAdmin(c, next) {
  return requirePermission("portal.super_admin.access", { mfa: true })(c, next);
}

export async function requireMfa(c, next) {
  const auth = c.get("auth");
  if (!auth || auth.aal !== "aal2") return c.json({ error: "Multi-factor authentication required", code: "MFA_REQUIRED" }, 403);
  await next();
}

// Hono middleware — extract Supabase JWT from Authorization header,
// validate via Supabase Auth, resolve users.workspace_id, attach as
// c.set("auth", { userId, email, workspaceId, role, jwt }).
// 401s if the header is missing or invalid.

import { supabaseAdmin } from "../lib/supabase.js";

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

  c.set("auth", {
    userId:      user.id,
    email:       row.email,
    workspaceId: row.workspace_id,
    role:        row.role,
    jwt,
  });
  await next();
}

/* Stricter gate — requires the user to carry role:'admin' in the
   `users` table. Use after requireAuth on any admin-only route. */
export async function requireAdmin(c, next) {
  const auth = c.get("auth");
  if (!auth || auth.role !== "admin") {
    return c.json({ error: "Admin only" }, 403);
  }
  await next();
}

/* Review-hierarchy authority above admin: decertification, reviewer-of-
   reviewers, cross-tenant ops. Powers are wired to routes in M2. */
export async function requireSuperAdmin(c, next) {
  const auth = c.get("auth");
  if (!auth || auth.role !== "super_admin") {
    return c.json({ error: "Super admin only" }, 403);
  }
  await next();
}

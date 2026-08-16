import { supabaseAdmin } from "./supabase.js";

export const PLATFORM_ROLES = new Set(["super_admin", "platform_admin", "creative_director", "designer"]);
export const WORKSPACE_ROLES = new Set(["workspace_admin", "user"]);

// Compatibility only: used while the scoped-access migration rolls out.
// New authorization decisions use role_permissions loaded from the database.
const LEGACY_ROLE_MAP = {
  super_admin: { scope: "platform", role: "super_admin" },
  admin: { scope: "platform", role: "platform_admin" },
  team: { scope: "platform", role: "designer" },
  client: { scope: "workspace", role: "workspace_admin" },
};

const FALLBACK_PERMISSIONS = {
  super_admin: ["portal.super_admin.access", "portal.admin.access", "portal.team.access", "workspace.read", "workspace.members.manage", "workspace.billing.manage", "workspace.delete", "brand.manage", "bio.read", "bio.propose", "bio.publish", "brief.read", "brief.write", "brief.run", "output.read", "output.write", "output.internal_submit", "output.internal_approve", "output.client_approve", "craft.request", "team.assignments.manage", "platform.workspaces.manage", "platform.people.manage", "platform.roles.manage", "platform.specs.manage", "platform.languages.manage", "platform.memory.read", "audit.read", "opex.read", "opex.export", "opex.budgets.manage", "opex.override"],
  platform_admin: ["portal.admin.access", "workspace.read", "workspace.members.manage", "workspace.billing.manage", "brand.manage", "bio.read", "bio.propose", "bio.publish", "brief.read", "brief.write", "brief.run", "output.read", "output.write", "output.client_approve", "craft.request", "team.assignments.manage", "platform.workspaces.manage", "platform.people.manage", "platform.specs.manage", "platform.languages.manage", "platform.memory.read"],
  creative_director: ["portal.team.access", "workspace.read", "brand.manage", "bio.read", "bio.propose", "brief.read", "brief.write", "brief.run", "output.read", "output.write", "output.internal_submit", "output.internal_approve", "craft.request", "team.assignments.manage"],
  designer: ["portal.team.access", "workspace.read", "bio.read", "bio.propose", "brief.read", "brief.write", "brief.run", "output.read", "output.write", "output.internal_submit", "craft.request"],
  workspace_admin: ["portal.client.access", "workspace.read", "workspace.members.manage", "workspace.billing.manage", "workspace.delete", "brand.manage", "bio.read", "bio.propose", "bio.publish", "brief.read", "brief.write", "brief.run", "output.read", "output.write", "output.client_approve", "craft.request"],
  user: ["portal.client.access", "workspace.read", "bio.read", "bio.propose", "brief.read", "brief.write", "brief.run", "output.read", "output.write", "output.client_approve", "craft.request"],
};

export function portalForPersona(persona) {
  if (persona === "super_admin") return "super_admin";
  if (persona === "platform_admin") return "admin";
  if (persona === "creative_director" || persona === "designer") return "team";
  return "client";
}

export function roleRequiresMfa(persona) {
  return PLATFORM_ROLES.has(persona) || persona === "workspace_admin";
}

export function decodeJwtClaims(jwt) {
  try {
    const payload = jwt.split(".")[1];
    if (!payload) return {};
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return {};
  }
}

export async function loadAuthorizationContext({ userId, legacyRole, legacyWorkspaceId }) {
  const [platformRes, membershipsRes, assignmentsRes, permissionRes] = await Promise.all([
    supabaseAdmin.from("platform_memberships").select("role, active").eq("user_id", userId).maybeSingle(),
    supabaseAdmin.from("workspace_memberships")
      .select("workspace_id, role, is_owner, status, workspace:workspaces(id,name,tier)")
      .eq("user_id", userId),
    supabaseAdmin.from("workspace_assignments")
      .select("workspace_id, workspace:workspaces(id,name,tier)")
      .eq("user_id", userId),
    supabaseAdmin.from("role_permissions").select("scope, role, permission"),
  ]);

  const migrationMissing = [platformRes, membershipsRes, assignmentsRes, permissionRes]
    .some((result) => result.error?.code === "42P01");
  const authorizationError = [platformRes, membershipsRes, assignmentsRes, permissionRes]
    .find((result) => result.error && result.error.code !== "42P01")?.error;
  if (authorizationError) throw new Error(`Authorization context unavailable: ${authorizationError.message}`);
  const activePlatform = platformRes.data?.active ? platformRes.data : null;
  const memberships = (membershipsRes.data || []).filter((row) => row.status === "active");
  const assignments = assignmentsRes.data || [];

  let scope = activePlatform ? "platform" : "workspace";
  let persona = activePlatform?.role || memberships[0]?.role || null;
  let compatibilityMode = false;
  if (!persona && migrationMissing) {
    const legacy = LEGACY_ROLE_MAP[legacyRole] || LEGACY_ROLE_MAP.client;
    scope = legacy.scope;
    persona = legacy.role;
    compatibilityMode = true;
    if (scope === "workspace" && legacyWorkspaceId) {
      memberships.push({ workspace_id: legacyWorkspaceId, role: persona, is_owner: true, status: "active", workspace: null });
    }
  }

  const permissionRows = permissionRes.data || [];
  const effective = permissionRows
    .filter((row) => row.scope === scope && row.role === persona)
    .map((row) => row.permission);
  const permissions = new Set(effective.length
    ? effective
    : migrationMissing ? (FALLBACK_PERMISSIONS[persona] || []) : []);

  return {
    scope,
    persona,
    portal: portalForPersona(persona),
    permissions,
    memberships,
    assignments,
    assignedWorkspaceIds: new Set(assignments.map((row) => row.workspace_id)),
    compatibilityMode: compatibilityMode || migrationMissing,
  };
}

export function canAccessWorkspace(auth, workspaceId) {
  if (!auth || !workspaceId) return false;
  if (auth.persona === "super_admin" || auth.persona === "platform_admin") return true;
  if (auth.scope === "platform") return auth.assignedWorkspaceIds?.has(workspaceId) || false;
  return (auth.memberships || []).some((row) => row.workspace_id === workspaceId && row.status === "active");
}

export function hasPermission(auth, permission, workspaceId = null) {
  if (!auth?.permissions?.has(permission)) return false;
  return workspaceId ? canAccessWorkspace(auth, workspaceId) : true;
}

export function serializeAuthorization(auth) {
  return {
    scope: auth.scope,
    persona: auth.persona,
    portal: auth.portal,
    permissions: [...auth.permissions].sort(),
    workspaces: (auth.memberships || []).map((row) => ({
      id: row.workspace_id,
      name: row.workspace?.name || null,
      tier: row.workspace?.tier || null,
      role: row.role,
      isOwner: !!row.is_owner,
      source: "membership",
    })),
    assignments: (auth.assignments || []).map((row) => ({
      id: row.workspace_id,
      name: row.workspace?.name || null,
      tier: row.workspace?.tier || null,
      source: "assignment",
    })),
    compatibilityMode: !!auth.compatibilityMode,
  };
}

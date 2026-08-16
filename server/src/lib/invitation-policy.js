const PLATFORM_INVITE_ROLES = ["super_admin", "platform_admin", "creative_director", "designer"];

export function invitationPolicyFor(persona) {
  if (["super_admin", "platform_admin"].includes(persona)) {
    return { platformRoles: PLATFORM_INVITE_ROLES, workspaceRoles: ["workspace_admin", "user"], permission: "platform.people.manage" };
  }
  if (persona === "creative_director") {
    return { platformRoles: ["designer"], workspaceRoles: [], permission: "team.assignments.manage" };
  }
  if (persona === "workspace_admin") {
    return { platformRoles: [], workspaceRoles: ["user"], permission: "workspace.members.manage" };
  }
  return { platformRoles: [], workspaceRoles: [], permission: null };
}

export function canInviteRole(auth, { platformRole, workspaceRole, workspaceId }) {
  const policy = invitationPolicyFor(auth?.persona);
  if (platformRole) return policy.platformRoles.includes(platformRole) && !!policy.permission;
  return !!workspaceId && policy.workspaceRoles.includes(workspaceRole || "user") && !!policy.permission;
}

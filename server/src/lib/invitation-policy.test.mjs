import assert from "node:assert/strict";
import test from "node:test";
import { canInviteRole, invitationPolicyFor } from "./invitation-policy.js";

test("Super Admin and Admin can invite every platform and workspace role", () => {
  for (const persona of ["super_admin", "platform_admin"]) {
    assert.deepEqual(invitationPolicyFor(persona).platformRoles, ["super_admin", "platform_admin", "creative_director", "designer"]);
    assert.equal(canInviteRole({ persona }, { platformRole: "super_admin" }), true);
    assert.equal(canInviteRole({ persona }, { workspaceId: "workspace", workspaceRole: "workspace_admin" }), true);
  }
});

test("Creative Directors invite Designers only and Workspace Admins invite Members only", () => {
  assert.equal(canInviteRole({ persona: "creative_director" }, { platformRole: "designer" }), true);
  assert.equal(canInviteRole({ persona: "creative_director" }, { platformRole: "creative_director" }), false);
  assert.equal(canInviteRole({ persona: "workspace_admin" }, { workspaceId: "workspace", workspaceRole: "user" }), true);
  assert.equal(canInviteRole({ persona: "workspace_admin" }, { workspaceId: "workspace", workspaceRole: "workspace_admin" }), false);
});

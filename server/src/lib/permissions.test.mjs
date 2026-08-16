import test from "node:test";
import assert from "node:assert/strict";
import { canAccessWorkspace, hasPermission, portalForPersona, roleRequiresMfa } from "./permissions.js";

const auth = (persona, permissions = [], memberships = [], assignments = []) => ({
  persona,
  scope: ["super_admin","platform_admin","creative_director","designer"].includes(persona) ? "platform" : "workspace",
  permissions: new Set(permissions), memberships, assignments,
  assignedWorkspaceIds: new Set(assignments.map(a => a.workspace_id)),
});

test("personas resolve to the correct portal and MFA posture", () => {
  assert.equal(portalForPersona("super_admin"), "super_admin");
  assert.equal(portalForPersona("platform_admin"), "admin");
  assert.equal(portalForPersona("designer"), "team");
  assert.equal(portalForPersona("user"), "client");
  assert.equal(roleRequiresMfa("workspace_admin"), true);
  assert.equal(roleRequiresMfa("user"), false);
});

test("assignment-scoped internal roles cannot cross tenants", () => {
  const designer = auth("designer", ["brief.read"], [], [{ workspace_id: "w1" }]);
  assert.equal(hasPermission(designer, "brief.read", "w1"), true);
  assert.equal(hasPermission(designer, "brief.read", "w2"), false);
});

test("workspace membership is required even when a permission exists", () => {
  const user = auth("user", ["brief.run"], [{ workspace_id: "w1", status: "active" }]);
  assert.equal(canAccessWorkspace(user, "w1"), true);
  assert.equal(hasPermission(user, "brief.run", "w2"), false);
});

test("platform operators are global but still need the explicit permission", () => {
  const platformAdmin = auth("platform_admin", ["platform.specs.manage"]);
  assert.equal(hasPermission(platformAdmin, "platform.specs.manage", "any-workspace"), true);
  assert.equal(hasPermission(platformAdmin, "opex.read"), false);
});

test("a suspended or unresolved persona receives no implicit authority", () => {
  const suspended = auth(null, []);
  assert.equal(hasPermission(suspended, "portal.super_admin.access"), false);
  assert.equal(hasPermission(suspended, "workspace.read", "w1"), false);
});

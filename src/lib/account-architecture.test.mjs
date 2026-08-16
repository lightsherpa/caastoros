import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("Account is the final dock destination and logout lives inside Account", async () => {
  const [shell, craft] = await Promise.all([
    read("../portal-shell.jsx"),
    read("../portal-craft.jsx"),
  ]);
  assert.match(shell, /TEAM_ACCOUNT_ROUTE/);
  assert.match(shell, /\["settings", "admin-account", "team-account"\]/);
  assert.doesNotMatch(shell, /app-dock__logout/);
  assert.match(craft, /settings-nav__logout/);
  assert.match(craft, /placeholder="Search settings"/);
  assert.match(craft, /settings-dialog__close/);
  assert.match(craft, /aria-label=\{t\("common\.logOut"\)\}/);
});

test("credits are consolidated into permission-aware Account views", async () => {
  const craft = await read("../portal-craft.jsx");
  assert.match(craft, /permissions\.has\("workspace\.members\.manage"\)/);
  assert.match(craft, /permissions\.has\("workspace\.billing\.manage"\)/);
  assert.match(craft, /portal === "team"/);
  assert.match(craft, /Assigned clients/);
  assert.match(craft, /Credit usage/);
});

test("every account has a personal profile with a saved name and avatar upload", async () => {
  const [craft, meRoute] = await Promise.all([
    read("../portal-craft.jsx"),
    read("../../server/src/routes/me.js"),
  ]);
  assert.match(craft, /Your profile/);
  assert.match(craft, /apiFetch\("\/api\/me\/profile"/);
  assert.match(craft, /apiFetch\("\/api\/me\/avatar"/);
  assert.match(meRoute, /app\.patch\("\/profile"/);
  assert.match(meRoute, /app\.post\("\/avatar"/);
});

test("Creative Directors and Workspace Admins see only their permitted invite role", async () => {
  const [craft, ops] = await Promise.all([
    read("../portal-craft.jsx"),
    read("../portal-ops.jsx"),
  ]);
  assert.match(craft, /invite-designers/);
  assert.match(ops, /Invite a designer/);
  assert.match(ops, /workspaceRole: "user"/);
  assert.match(ops, />Member<\/span>/);
});

test("internal credit reads require access to the selected workspace", async () => {
  const creditsRoute = await read("../../server/src/routes/credits.js");
  assert.match(creditsRoute, /canAccessWorkspace\(auth, workspaceId\)/);
  assert.match(creditsRoute, /c\.req\.query\("workspaceId"\)/);
});

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

test("internal credit reads require access to the selected workspace", async () => {
  const creditsRoute = await read("../../server/src/routes/credits.js");
  assert.match(creditsRoute, /canAccessWorkspace\(auth, workspaceId\)/);
  assert.match(creditsRoute, /c\.req\.query\("workspaceId"\)/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const homeUrl = new URL("./portal-brandolph.jsx", import.meta.url);
const canvasUrl = new URL("./portal-briefs.jsx", import.meta.url);
const floaterUrl = new URL("./portal-floater.jsx", import.meta.url);

test("brief sharpening and handoff pin the selected brand", async () => {
  const source = await readFile(homeUrl, "utf8");
  assert.match(source, /JSON\.stringify\(\{ briefText: input\.trim\(\), brandId: activeBrandId \}\)/);
  assert.match(source, /brandId:\s+activeBrandId,/);
  assert.match(source, /brandId:\s+briefBrandId \|\| activeBrandId,/);
});

test("canvas creation paths carry the pinned context brand", async () => {
  const source = await readFile(canvasUrl, "utf8");
  const pinnedCalls = source.match(/brandId:\s+context\.brandId,/g) || [];
  assert.ok(pinnedCalls.length >= 3, "main, mood-board, and companion-image runs must all be pinned");
  assert.match(source, /ctx\.specialistIds\.length > 0 && ctx\.brandId/);
});

test("Brandolph chat carries the selected brand instead of using a server fallback", async () => {
  const source = await readFile(floaterUrl, "utf8");
  assert.match(source, /JSON\.stringify\(\{ messages: history, routeId, brandId \}\)/);
  assert.match(source, /brandId: currentBrandId,/);
});

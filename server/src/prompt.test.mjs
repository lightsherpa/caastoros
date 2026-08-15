// server/src/prompt.test.mjs
// CAA-26: buildBrandolphSystem must survive a partial/legacy certified BIO
// (P1 crash-guard), never ship a literal crew count (P2), carry the shared
// persona composite (P3), and keep raw route slugs out of the prompt (P3).
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildBrandolphSystem } from "./prompt.js";

const FULL_BIO = {
  version: 3, score: 82,
  identity: { positioning: "The quiet default", category: "Tools", founded: "2019", pillars: ["clarity", "restraint"] },
  audience: { primary: "senior operators", secondary: "founders", jtbd: ["ship faster", "look sharp"] },
  voice: { register: "editorial, low-urgency", forbidden: ["unlock", "leverage"], rhythm: "short", signatures: ["the one line"] },
  visual: { palette: [{ name: "Ink", hex: "#111" }], type: [{ kind: "display", family: "GT" }], imagery: ["grain"], avoid: ["stock smiles"] },
  goals: { northStar: "own the category word", q2: "launch", q3: "expand" },
  strategic: { watchouts: ["don't chase trends"], notList: ["not a toy"] },
};

test("full BIO builds the standard 4 content blocks", () => {
  const blocks = buildBrandolphSystem({ brand: { name: "Acme" }, bio: FULL_BIO, refusals: ["no fake urgency"], routeId: "home" });
  assert.equal(blocks.length, 4);
  assert.match(blocks[1].text, /Palette: Ink #111/);
  assert.match(blocks[1].text, /BIO score 82\/100/);
});

test("P1: a partial/legacy BIO (missing whole sections) does not throw", () => {
  const partial = { version: 2, identity: { positioning: "The quiet default" } };
  let blocks;
  assert.doesNotThrow(() => {
    blocks = buildBrandolphSystem({ brand: { name: "Acme" }, bio: partial, refusals: ["no fake urgency"], routeId: "briefs" });
  });
  const bioBlock = blocks[1].text;
  assert.match(bioBlock, /Positioning: The quiet default/);
  // Sections with no data are simply omitted — not rendered with undefined.
  assert.doesNotMatch(bioBlock, /VISUAL/);
  assert.doesNotMatch(bioBlock, /AUDIENCE/);
  assert.doesNotMatch(bioBlock, /undefined/);
});

test("P1: an empty or null BIO still builds without throwing", () => {
  assert.doesNotThrow(() => buildBrandolphSystem({ brand: {}, bio: {}, refusals: [] }));
  assert.doesNotThrow(() => buildBrandolphSystem({ brand: {}, bio: null, refusals: [] }));
});

test("P2: no shipped block bakes a literal crew count", () => {
  const blocks = buildBrandolphSystem({ brand: { name: "Acme" }, bio: FULL_BIO, refusals: [] });
  for (const b of blocks) {
    assert.doesNotMatch(b.text, /\d+-person crew/, `block leaked a literal crew count: ${b.text.slice(0, 80)}`);
  }
  assert.match(blocks[0].text, /senior crew/);
});

test("P3: the shared persona composite is present in the platform block", () => {
  const blocks = buildBrandolphSystem({ brand: { name: "Acme" }, bio: FULL_BIO, refusals: [] });
  assert.match(blocks[0].text, /composite of six operators/);
});

test("P3: routeId is humanized, never leaked raw; unknown slugs are omitted", () => {
  const known = buildBrandolphSystem({ brand: {}, bio: {}, refusals: [], routeId: "brief-detail" });
  assert.match(known[3].text, /a single brief/);
  assert.doesNotMatch(known[3].text, /brief-detail/);

  const unknown = buildBrandolphSystem({ brand: {}, bio: {}, refusals: [], routeId: "some-internal-slug" });
  assert.doesNotMatch(unknown[3].text, /some-internal-slug/);
  assert.doesNotMatch(unknown[3].text, /currently on/);
});

// server/src/lib/compose-image-prompt.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { composeImagePrompt } from "./compose-image-prompt.js";

const base = {
  spec: { payload: { role: "Social post designer" } },
  brand: { name: "Acme" },
  bio: { visual: {} },
  refusals: [],
  brief: "A spring drop hero",
};

test("without sourceText the prompt has no accompanying-copy line", () => {
  const p = composeImagePrompt(base);
  assert.doesNotMatch(p, /accompanies this copy/i);
});

test("with sourceText the prompt instructs to depict the copy's subject, not the text", () => {
  const p = composeImagePrompt({ ...base, sourceText: "Bloom season is here" });
  assert.match(p, /accompanies this copy/i);
  assert.match(p, /Bloom season is here/);
  assert.match(p, /do not render the text/i);
});

test("with artDirection the prompt leads with the directed scene", () => {
  const p = composeImagePrompt({ ...base, artDirection: "Full-bleed photo of a single cold brew glass on sun-warmed stone." });
  assert.match(p, /art direction/i);
  assert.match(p, /sun-warmed stone/);
});

test("without artDirection there is no art-direction line", () => {
  const p = composeImagePrompt(base);
  assert.doesNotMatch(p, /art direction/i);
});

test("artDirection still forbids rendering text", () => {
  const p = composeImagePrompt({ ...base, artDirection: "A pastel still life." });
  assert.match(p, /do not render any text/i);
});

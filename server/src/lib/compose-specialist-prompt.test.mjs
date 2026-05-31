// server/src/lib/compose-specialist-prompt.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { composeSpecialistPrompt } from "./compose-specialist-prompt.js";

const base = {
  spec: { specialist_id: "a16", payload: { name: "Social Captions", kind: "copy" } },
  brand: { name: "Acme" },
  bio: { version: 1, identity: { positioning: "p" } },
  refusals: [],
  brief: "Five captions",
};

test("without deliverableContract returns the original 4 content blocks", () => {
  const blocks = composeSpecialistPrompt(base);
  assert.equal(blocks.length, 4);
});

test("with deliverableContract appends a 5th block containing the contract", () => {
  const blocks = composeSpecialistPrompt({ ...base, deliverableContract: "RETURN-STRICT-JSON-XYZ" });
  assert.equal(blocks.length, 5);
  assert.equal(blocks[4].type, "text");
  assert.match(blocks[4].text, /RETURN-STRICT-JSON-XYZ/);
  assert.match(blocks[4].text, /OUTPUT FORMAT/);
});

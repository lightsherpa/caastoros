// server/src/lib/compose-specialist-prompt.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { composeSpecialistPrompt } from "./compose-specialist-prompt.js";
// Dependency contract: the BIO layer is produced by the shared tiered
// reader. This test asserts the wiring, so getBioForAgent must exist —
// the integrator lands it in bio-schema.js (M4). Until then these tests
// fail at import/run, which is the intended signal.
import { getBioForAgent } from "./bio-schema.js";

const base = {
  spec: {
    specialist_id: "a16",
    payload: {
      name: "Social Captions",
      kind: "copy",
      bioSlices: ["positioning", "voice", "forbidden"],
    },
  },
  brand: { name: "Acme" },
  bio: {
    version: 1,
    identity: { positioning: "The bank that never raises its voice" },
    voice: { register: "plainspoken", forbidden: ["synergy", "leverage"] },
  },
  refusals: [],
  brief: "Five captions",
};

// helper: concatenate every content block's text
const allText = (blocks) => blocks.map((b) => b.text).join("\n\n");

test("the shared tiered reader is available (integrator dependency)", () => {
  assert.equal(typeof getBioForAgent, "function");
});

test("first block is the cached PLATFORM preamble and carries the anti-invention guardrail", () => {
  const blocks = composeSpecialistPrompt(base);
  assert.equal(blocks[0].type, "text");
  assert.deepEqual(blocks[0].cache_control, { type: "ephemeral" });
  // anti-invention guardrail phrasing
  assert.match(blocks[0].text, /never invent brand attributes/i);
  assert.match(blocks[0].text, /do not fabricate/i);
});

test("BIO block(s) carry the positioning and the forbidden words from the sample bio", () => {
  const blocks = composeSpecialistPrompt(base);
  const text = allText(blocks);
  assert.match(text, /never raises its voice/); // positioning
  assert.match(text, /synergy/);                // forbidden word
  assert.match(text, /leverage/);               // forbidden word
});

test("at least one BIO block carries cache_control:ephemeral (the reader's core block)", () => {
  const blocks = composeSpecialistPrompt(base);
  // blocks[0] is PLATFORM; the BIO block(s) follow it before SPEC/TASK.
  const cached = blocks.filter((b) => b.cache_control && b.cache_control.type === "ephemeral");
  assert.ok(cached.length >= 2, "expected PLATFORM + at least one cached BIO block");
});

test("every block matches the router content-block shape {type:'text', text}", () => {
  const blocks = composeSpecialistPrompt(base);
  for (const b of blocks) {
    assert.equal(b.type, "text");
    assert.equal(typeof b.text, "string");
  }
});

test("deliverableContract appends a final block containing the contract", () => {
  const without = composeSpecialistPrompt(base);
  const withContract = composeSpecialistPrompt({ ...base, deliverableContract: "RETURN-STRICT-JSON-XYZ" });
  assert.equal(withContract.length, without.length + 1);
  const last = withContract[withContract.length - 1];
  assert.equal(last.type, "text");
  assert.match(last.text, /RETURN-STRICT-JSON-XYZ/);
  assert.match(last.text, /OUTPUT FORMAT/);
});

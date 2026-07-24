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

test("renders specialist evidence, handoff, structured-output, and QA contracts", () => {
  const blocks = composeSpecialistPrompt({
    ...base,
    spec: {
      specialist_id: "a31",
      payload: {
        name: "Site Scanner",
        evidenceContract: "Cite every external claim.",
        handoffContract: "Return sourceUrl and findingId.",
        structuredOutput: { findings: [] },
        qaGates: ["Every finding has evidence"],
      },
    },
  });
  assert.match(blocks[2].text, /EVIDENCE CONTRACT: Cite every external claim/);
  assert.match(blocks[2].text, /HANDOFF CONTRACT: Return sourceUrl and findingId/);
  assert.match(blocks[2].text, /STRUCTURED OUTPUT \(VALID JSON ONLY\):/);
  assert.match(blocks[2].text, /Every finding has evidence/);
});

test("renders the catalog's handoffRequirements alias", () => {
  const blocks = composeSpecialistPrompt({
    ...base,
    spec: { specialist_id: "a02", payload: { handoffRequirements: "Pass the exact proposition to a03." } },
  });
  assert.match(blocks[2].text, /HANDOFF CONTRACT: Pass the exact proposition to a03/);
});

test("gives downstream specialists substantial, attributed handoff context", () => {
  const upstream = "x".repeat(500);
  const blocks = composeSpecialistPrompt({
    ...base,
    priorOutputs: [{ kind: "territory", specialist_id: "a06", body: upstream }],
  });
  assert.match(blocks[3].text, /AUTHORITATIVE HANDOFFS/);
  assert.match(blocks[3].text, /territory · a06/);
  assert.ok(blocks[3].text.includes(upstream));
  assert.match(blocks[3].text, /next specialist's job easier/);
});

test("includes imagery when it is the only requested visual BIO slice", () => {
  const blocks = composeSpecialistPrompt({
    ...base,
    spec: { specialist_id: "a20", payload: { name: "Hero KV", bioSlices: ["imagery"] } },
    bio: { version: 1, identity: { positioning: "p" }, visual: { imagery: ["hard daylight", "tactile paper"] } },
  });
  assert.match(blocks[1].text, /IMAGERY: hard daylight · tactile paper/);
});

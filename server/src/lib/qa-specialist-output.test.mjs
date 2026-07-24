import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkHandoff,
  checkResearchEvidence,
  checkRequiredOutput,
  checkVisualDirection,
  contractFromSpecialist,
  createSpecialistOutputGate,
  qaSpecialistOutput,
} from "./qa-specialist-output.js";

test("required output checks JSON, fields, and markdown sections", () => {
  const verdict = qaSpecialistOutput({
    output: JSON.stringify({ title: "Launch", body: "## Recommendation\nShip it." }),
    contract: {
      format: "json",
      requiredFields: ["title", "owner"],
      requiredSections: ["Recommendation", "Risks"],
    },
  });

  assert.equal(verdict.passed, false);
  assert.deepEqual(verdict.issues.map((item) => item.code), ["field.missing", "section.missing"]);
  assert.deepEqual(verdict.issues.map((item) => item.path), ["owner", "Risks"]);
});

test("invalid JSON fails without throwing", () => {
  const verdict = qaSpecialistOutput({ output: "{not-json", contract: { format: "json" } });
  assert.equal(verdict.passed, false);
  assert.equal(verdict.issues[0].code, "format.invalid_json");
});

test("research role requires traceable citations by default", () => {
  const verdict = qaSpecialistOutput({
    output: { findings: ["Demand is rising"], citations: ["Industry report"] },
    specialist: { kind: "research" },
  });

  assert.equal(verdict.passed, false);
  assert.equal(verdict.issues[0].code, "research.citation_untraceable");

  const passing = qaSpecialistOutput({
    output: { citations: [{ title: "Report", url: "https://example.com/report" }] },
    specialist: { specialist_id: "a32", payload: { tags: ["market-research"] } },
  });
  assert.equal(passing.passed, true);
});

test("research citation policy can accept named offline sources", () => {
  const result = checkResearchEvidence({
    value: { evidence: [{ source: "Customer interview 12" }] },
    contract: { research: { requireUrl: false, minCitations: 1 } },
  });
  assert.equal(result.passed, true);
});

test("research prose can satisfy evidence QA with inline source URLs", () => {
  const result = checkResearchEvidence({
    value: "Demand rose in the latest dataset (https://example.com/data).",
    specialist: { role: "market researcher" },
  });
  assert.equal(result.passed, true);
});

test("research objects can expose nested URL or internal source evidence", () => {
  const webResult = checkResearchEvidence({
    value: { findings: [{ claim: "Observed", page: { url: "https://example.com/about" } }] },
    specialist: { role: "site researcher" },
  });
  assert.equal(webResult.passed, true);

  const internalResult = checkResearchEvidence({
    value: { fieldEvidence: [{ field: "voice", sourceIds: ["upload-12"] }] },
    contract: { research: { requireUrl: false } },
  });
  assert.equal(internalResult.passed, true);
});

test("handoff reports each missing cross-agent field", () => {
  const result = checkHandoff({
    value: { handoff: { to: "a41", summary: "Approved direction" } },
    contract: { handoff: true },
  });

  assert.equal(result.passed, false);
  assert.deepEqual(result.issues.map((item) => item.path), ["handoff.inputs", "handoff.nextStep"]);
});

test("handoff paths and fields are configurable", () => {
  const result = checkHandoff({
    value: { transfer: { recipient: "image-agent", brief: "Create the hero" } },
    contract: { handoff: { path: "transfer", requiredFields: ["recipient", "brief"] } },
  });
  assert.equal(result.passed, true);
});

test("visual agents accept complete structured visual direction", () => {
  const verdict = qaSpecialistOutput({
    output: {
      visualDirection: {
        subject: "A single cobalt bottle",
        composition: "Centered close-up",
        lighting: "Soft daylight from the left",
        mood: "Calm and editorial",
      },
    },
    specialist: { role: "Senior image designer" },
  });

  assert.equal(verdict.passed, true);
});

test("narrative visual direction identifies incomplete art direction", () => {
  const result = checkVisualDirection({
    value: { visualDirection: "A cobalt bottle on a plain studio surface." },
    contract: { visualDirection: true },
  });

  assert.equal(result.passed, false);
  assert.deepEqual(result.issues.map((item) => item.path), [
    "visualDirection.composition",
    "visualDirection.lighting",
    "visualDirection.mood",
  ]);
});

test("narrative visual direction supports the existing sentence contract", () => {
  const result = checkVisualDirection({
    value: {
      visualDirection: "A cobalt bottle, centered in close-up, with soft daylight and a calm editorial mood.",
    },
    contract: { visualDirection: true },
  });
  assert.equal(result.passed, true);
});

test("all policies compose into one deterministic verdict", () => {
  const args = {
    output: {
      recommendation: "Launch",
      citations: ["https://example.com/source"],
      handoff: {
        to: "a41",
        summary: "Research-backed launch route",
        inputs: ["recommendation", "source"],
        nextStep: "Create the launch image",
      },
      visualDirection: {
        subject: "Product in use",
        composition: "Wide frame",
        lighting: "Natural daylight",
        mood: "Confident",
      },
    },
    specialist: { tags: ["research", "visual"] },
    contract: {
      format: "object",
      requiredSections: ["recommendation"],
      handoff: true,
    },
  };

  assert.deepEqual(qaSpecialistOutput(args), qaSpecialistOutput(args));
  assert.equal(qaSpecialistOutput(args).passed, true);
});

test("gate factory composes selected or custom checks", () => {
  const custom = ({ value }) => ({
    name: "approval",
    passed: value.approved === true,
    issues: value.approved === true
      ? []
      : [{ code: "approval.missing", path: "approved", message: "Approval is required." }],
  });
  const gate = createSpecialistOutputGate({ checks: [checkRequiredOutput, custom] });
  const verdict = gate({ output: { title: "Ready" }, contract: { requiredFields: ["title"] } });

  assert.equal(verdict.passed, false);
  assert.equal(verdict.checks.length, 2);
  assert.equal(verdict.issues[0].code, "approval.missing");
});

test("derives enforceable QA policy from a specialist spec", () => {
  const contract = contractFromSpecialist({
    payload: {
      evidenceContract: "Cite every claim.",
      structuredOutput: { recommendation: "", citations: [], handoff: {} },
      qaContract: { research: { minCitations: 2 } },
    },
  });
  assert.equal(contract.format, "object");
  assert.deepEqual(contract.requiredFields, ["recommendation", "citations", "handoff"]);
  assert.deepEqual(contract.research, { minCitations: 2 });
  assert.equal(contract.handoff, true);
  assert.equal(contract.visualDirection, false);
});

test("string structured-output contracts require valid JSON", () => {
  const contract = contractFromSpecialist({ payload: { structuredOutput: "Return {title, findings[]}." } });
  assert.equal(contract.format, "json");
  assert.equal(qaSpecialistOutput({ output: "Title: audit", contract }).passed, false);
  assert.equal(qaSpecialistOutput({ output: '{"title":"audit","findings":[]}', contract }).passed, true);
});

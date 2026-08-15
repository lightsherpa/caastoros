import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeBio,
  projectBio,
  getBioForAgent,
  computeAgentProvenance,
  SCORED_PATHS,
  SECTIONS,
  SCHEMA_VERSION,
} from "./bio-schema.js";
import { buildBrandolphSystem } from "../prompt.js";

const TEST_BRAND = { id: "test-brand", name: "Test Brand", url: "test.example" };
const TEST_REFUSALS = ["Never invent a discount."];
const TEST_BIO = {
  identity: {
    positioning: "A considered product for deliberate routines.",
    category: "Consumer goods",
    founded: "2024",
    pillars: ["Provenance", "Routine", "Patience", "Craft"],
  },
  audience: {
    primary: "People who value deliberate choices.",
    secondary: "Returning customers.",
    tertiary: "Trade partners.",
    jtbd: ["Make a considered choice"],
  },
  voice: {
    register: "Editorial and restrained.",
    forbidden: ["unlock", "exclusive"],
    rhythm: "Short, direct sentences.",
    signatures: ["On purpose"],
  },
  visual: {
    palette: [{ hex: "#1F1A14", name: "Espresso" }],
    type: [{ kind: "Display", family: "Sans" }],
    imagery: ["Craft details"],
    avoid: ["Generic stock photography"],
  },
  goals: { northStar: "Grow deliberately.", q2: "Launch pricing.", q3: "Launch the seasonal collection." },
  strategic: { watchouts: ["Protect positioning."], notList: ["Discount-led growth."] },
};

// The historical scored-path list, before it was derived from the registry.
// If this drifts from SCORED_PATHS, scoreBio's coverage surface changed —
// which would silently move every BIO score. It must not.
const GOLDEN_SCORED = [
  ["identity", "positioning"], ["identity", "category"], ["identity", "founded"], ["identity", "pillars"],
  ["audience", "primary"], ["audience", "secondary"], ["audience", "tertiary"], ["audience", "jtbd"],
  ["voice", "register"], ["voice", "forbidden"], ["voice", "rhythm"], ["voice", "signatures"],
  ["goals", "northStar"], ["goals", "q2"], ["goals", "q3"],
  ["strategic", "watchouts"], ["strategic", "notList"],
];

test("SCORED_PATHS exactly matches the historical list (no scoring drift)", () => {
  assert.deepEqual(SCORED_PATHS, GOLDEN_SCORED);
});

// ── normalizeBio ────────────────────────────────────────────────────

test("normalizeBio on empty gives every section + defaulted fields", () => {
  const n = normalizeBio({});
  for (const s of SECTIONS) assert.ok(n[s] && typeof n[s] === "object", `${s} present`);
  assert.deepEqual(n.identity.pillars, []);
  assert.equal(n.identity.positioning, "");
  assert.deepEqual(n.visual.palette, []);
  assert.deepEqual(n.voice.forbidden, []);
  assert.deepEqual(n.confidence, {});
  assert.deepEqual(n.missing, []);
  assert.deepEqual(n.conflicts, []);
  assert.equal(n.schema_version, SCHEMA_VERSION);
});

test("normalizeBio fills gaps without overwriting present values or extras", () => {
  const n = normalizeBio({ identity: { positioning: "x", name: "Legacy" }, version: 7, score: 55 });
  assert.equal(n.identity.positioning, "x");      // preserved
  assert.equal(n.identity.name, "Legacy");        // extra key preserved
  assert.deepEqual(n.identity.pillars, []);       // gap filled
  assert.ok(n.visual && Array.isArray(n.visual.imagery)); // absent section filled
  assert.equal(n.version, 7);                     // meta preserved
  assert.equal(n.score, 55);
});

test("normalizeBio preserves a full payload's values", () => {
  const n = normalizeBio(TEST_BIO);
  assert.equal(n.identity.positioning, TEST_BIO.identity.positioning);
  assert.deepEqual(n.voice.forbidden, TEST_BIO.voice.forbidden);
  assert.equal(n.visual.palette[0].name, "Espresso");
  assert.equal(n.audience.tertiary, TEST_BIO.audience.tertiary);
});

test("normalizeBio is idempotent", () => {
  const once = normalizeBio(TEST_BIO);
  const twice = normalizeBio(once);
  assert.deepEqual(twice, once);
  const emptyOnce = normalizeBio({});
  assert.deepEqual(normalizeBio(emptyOnce), emptyOnce);
});

test("normalizeBio tolerates non-object input", () => {
  assert.doesNotThrow(() => normalizeBio(null));
  assert.doesNotThrow(() => normalizeBio(undefined));
  assert.doesNotThrow(() => normalizeBio("nope"));
});

// ── renderBioLayer null-safety (the Brandolph 400 fix) ──────────────

test("buildBrandolphSystem does not throw on a partial BIO", () => {
  // Before M0 this path dereferenced bio.visual.palette.map etc. and 400'd.
  const bio = normalizeBio({ identity: { positioning: "p" }, version: 2, score: 40 });
  let blocks;
  assert.doesNotThrow(() => {
    blocks = buildBrandolphSystem({ brand: { name: "X" }, bio, refusals: [], routeId: null });
  });
  // PLATFORM + N BIO blocks (tiered getBioForAgent) + SPEC + TASK.
  assert.ok(blocks.length >= 4, `expected >= 4 blocks, got ${blocks.length}`);
  assert.match(blocks[1].text, /BRAND INTELLIGENCE OBJECT/);
});

test("buildBrandolphSystem renders a full BIO intact (no regression)", () => {
  const bio = normalizeBio({ ...TEST_BIO, version: 1, score: 91 });
  const blocks = buildBrandolphSystem({
    brand: TEST_BRAND, bio, refusals: TEST_REFUSALS, routeId: "home",
  });
  // Content is spread across the tiered BIO blocks now — assert on the union.
  const text = blocks.map((b) => b.text).join("\n");
  assert.match(text, /A considered product for deliberate routines\./); // positioning (core)
  assert.match(text, /Provenance, Routine, Patience, Craft/);         // pillars joined (core)
  assert.match(text, /Espresso #1F1A14/);                            // palette rendered (detail)
  assert.match(text, /seasonal collection/);                         // goals.q3 rendered (detail)
});

// ── projectBio (event-sourced projection) ───────────────────────────

const A = (field_path, value, extra = {}) => ({ field_path, value, seq: 1, ...extra });

test("projectBio folds a single assertion into payload + confidence", () => {
  const { payload, confidence, missing } = projectBio([
    A("identity.positioning", "Slow coffee.", { seq: 1, confidence: 90, source: "homepage" }),
  ]);
  assert.equal(payload.identity.positioning, "Slow coffee.");
  assert.deepEqual(confidence["identity.positioning"], { conf: 90, source: "homepage" });
  assert.ok(!missing.some((m) => m.field === "identity.positioning"));
  assert.ok(missing.some((m) => m.field === "voice.forbidden")); // unasserted field is missing
});

test("projectBio: a human-confirmed assertion wins over a later unconfirmed one", () => {
  const { payload, conflicts } = projectBio([
    A("identity.category", "Coffee", { seq: 1, human_confirmed: true }),
    A("identity.category", "Tea", { seq: 2 }),
  ]);
  assert.equal(payload.identity.category, "Coffee");    // confirmed wins despite lower seq
  assert.equal(conflicts.length, 0);                    // human resolved it
});

test("projectBio: divergent unconfirmed values raise a conflict, take the latest", () => {
  const { payload, conflicts } = projectBio([
    A("identity.category", "Coffee", { seq: 1 }),
    A("identity.category", "Tea", { seq: 2 }),
  ]);
  assert.equal(payload.identity.category, "Tea");       // latest as tentative
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].field_path, "identity.category");
  assert.equal(conflicts[0].values.length, 2);
});

test("projectBio is deterministic regardless of input order", () => {
  const asserts = [
    A("identity.positioning", "P", { seq: 1, confidence: 80, source: "site" }),
    A("voice.register", "Warm", { seq: 3, confidence: 70, source: "about" }),
    A("identity.category", "Cat", { seq: 2, human_confirmed: true }),
  ];
  const forward = projectBio(asserts);
  const reversed = projectBio([...asserts].reverse());
  const shuffled = projectBio([asserts[1], asserts[2], asserts[0]]);
  assert.deepEqual(reversed, forward);
  assert.deepEqual(shuffled, forward);
});

test("projectBio output payload is canonical (all sections present)", () => {
  const { payload } = projectBio([A("goals.northStar", "Win", { seq: 1 })]);
  for (const s of SECTIONS) assert.ok(payload[s], `${s} present`);
  assert.equal(payload.goals.northStar, "Win");
});

// ── getBioForAgent + computeAgentProvenance (M4 agent read-contract) ──

const SAMPLE = {
  version: 4,
  identity: { positioning: "P", category: "C", pillars: ["a", "b"] },
  audience: { primary: "A", secondary: "S" },
  voice: { register: "R", rhythm: "Ry", forbidden: ["x"], signatures: ["sig"] },
  goals: { northStar: "N" },
  confidence: { "identity.category": { conf: 40 }, "voice.register": { conf: 90 } },
};

test("getBioForAgent specialist: core + slice blocks, cache-aware, refusals in core", () => {
  const { blocks } = getBioForAgent({ bio: SAMPLE, audience: "specialist", slices: ["voice"], refusals: ["never lie"] });
  assert.equal(blocks.length, 2);
  assert.ok(blocks[0].cache_control && blocks[1].cache_control, "both blocks cached");
  assert.match(blocks[0].text, /POSITIONING: P/);
  assert.match(blocks[0].text, /FORBIDDEN WORDS.*x/);
  assert.match(blocks[0].text, /never lie/);       // brand-global refusals ride in core
  assert.match(blocks[1].text, /RHYTHM: Ry/);      // voice-slice detail
});

test("getBioForAgent marks low-confidence fields, leaves high-confidence unmarked", () => {
  const text = getBioForAgent({ bio: SAMPLE, audience: "specialist", slices: [] }).blocks.map((b) => b.text).join("\n");
  assert.match(text, /CATEGORY: C \(inferred/);           // conf 40 → flagged
  assert.doesNotMatch(text, /VOICE REGISTER: R \(inferred/); // conf 90 → not flagged
});

test("getBioForAgent emits a do-not-invent gap line naming absent fields", () => {
  const text = getBioForAgent({ bio: SAMPLE, audience: "brandolph" }).blocks.map((b) => b.text).join("\n");
  assert.match(text, /Do not invent these/);
  assert.match(text, /WHAT THE BRAND IS NOT/);            // strategic.notList absent → named
});

test("getBioForAgent brandolph reads the full BIO (non-core fields present)", () => {
  const text = getBioForAgent({ bio: SAMPLE, audience: "brandolph" }).blocks.map((b) => b.text).join("\n");
  assert.match(text, /BRAND INTELLIGENCE OBJECT/);
  assert.match(text, /SECONDARY AUDIENCE: S/);
});

test("getBioForAgent tolerates an empty BIO (no throw)", () => {
  let blocks;
  assert.doesNotThrow(() => { blocks = getBioForAgent({ bio: {}, audience: "specialist", slices: ["voice"] }).blocks; });
  assert.ok(blocks.length >= 1);
});

test("computeAgentProvenance lists only absent registered fields in the key set", () => {
  const { missing } = computeAgentProvenance(SAMPLE, new Set(["voice.signatures", "strategic.notList"]));
  assert.ok(!missing.includes("SIGNATURES"));            // present
  assert.ok(missing.some((m) => /NOT/.test(m)));         // notList absent
});

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeBio,
  projectBio,
  SCORED_PATHS,
  SECTIONS,
  SCHEMA_VERSION,
} from "./bio-schema.js";
import { buildBrandolphSystem } from "../prompt.js";
import { VINILO_BIO, VINILO_BRAND, VINILO_REFUSALS } from "../data/vinilo.js";

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
  const n = normalizeBio(VINILO_BIO);
  assert.equal(n.identity.positioning, VINILO_BIO.identity.positioning);
  assert.deepEqual(n.voice.forbidden, VINILO_BIO.voice.forbidden);
  assert.equal(n.visual.palette[0].name, "Espresso");
  assert.equal(n.audience.tertiary, VINILO_BIO.audience.tertiary);
});

test("normalizeBio is idempotent", () => {
  const once = normalizeBio(VINILO_BIO);
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
  assert.equal(blocks.length, 4);
  assert.match(blocks[1].text, /BRAND INTELLIGENCE OBJECT/);
});

test("buildBrandolphSystem renders a full BIO intact (no regression)", () => {
  const bio = normalizeBio({ ...VINILO_BIO, version: 1, score: 91 });
  const blocks = buildBrandolphSystem({
    brand: VINILO_BRAND, bio, refusals: VINILO_REFUSALS, routeId: "home",
  });
  const text = blocks[1].text;
  assert.match(text, /Specialty coffee for slow Tuesdays\./);
  assert.match(text, /Provenance, Routine, Patience, Café-as-rest/); // pillars joined
  assert.match(text, /Espresso #1F1A14/);                            // palette rendered
  assert.match(text, /Q3: Honduras/);                                // goals rendered
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

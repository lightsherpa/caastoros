// ─────────────────────────────────────────────────────────────────────
// Phase-3 determinism probe — proves the BIO "deterministic layer" is a
// pure function of its inputs: identical inputs → byte-identical outputs,
// repeatedly, with order-independence / clamp / bounds / monotonicity
// property checks.
//
// This is the machine proof behind the guarantee "identical discovery
// inputs → identical scoring." It imports ONLY the pure modules (no DB, no
// env, no network) so `node --test scripts/probe-determinism.mjs` runs
// anywhere. Anything that touches Supabase (self-certify.js, the routes) is
// deliberately NOT imported — those are not part of the deterministic layer.
//
// Run:  node --test scripts/probe-determinism.mjs
// ─────────────────────────────────────────────────────────────────────

import { test } from "node:test";
import assert from "node:assert/strict";

import { scoreBio, scoreBioBreakdown } from "../server/src/lib/score-bio.js";
import { evaluateCertification, DEFAULT_RUBRIC } from "../server/src/lib/evaluate-certification.js";
import {
  projectBio,
  normalizeBio,
  getBioForAgent,
  computeAgentProvenance,
  SCORED_PATHS,
} from "../server/src/lib/bio-schema.js";
import { payloadHash } from "../server/src/lib/bio-hash.js";

const REPEAT = 200;
const clone = (v) => JSON.parse(JSON.stringify(v));

// Assert fn(input) is deep-equal across `n` fresh invocations (input cloned
// each call so no shared-mutation could mask non-determinism).
function stableAcross(fn, input, n = REPEAT) {
  const first = fn(clone(input));
  for (let i = 0; i < n; i++) assert.deepEqual(fn(clone(input)), first);
  return first;
}

// Build a fully-covered payload: every SCORED_PATH filled + a confidence
// entry at `conf` from `source`. Deterministic generator, no randomness.
function fullPayload({ conf = 80, source = "homepage" } = {}) {
  const payload = { confidence: {} };
  for (const [s, k] of SCORED_PATHS) {
    payload[s] = payload[s] || {};
    // list fields get a 1-elem array, scalars a string — both are "non-empty".
    payload[s][k] = ["pillars", "jtbd", "forbidden", "signatures", "watchouts", "notList"].includes(k)
      ? [`${s}.${k}.v`]
      : `${s}.${k}.v`;
    payload.confidence[`${s}.${k}`] = { conf, source };
  }
  return payload;
}

// ── scoreBio / scoreBioBreakdown ─────────────────────────────────────

test("scoreBio: identical payload → identical score across 200 runs", () => {
  const p = fullPayload({ conf: 73, source: "about" });
  const score = stableAcross(scoreBio, p);
  const bd = stableAcross(scoreBioBreakdown, p);
  assert.equal(bd.score, score);
});

test("scoreBio: bounded 0..100 and integer for a spread of inputs", () => {
  for (const conf of [0, 1, 37, 50, 84, 100]) {
    for (const nSources of [0, 1, 3, 5, 9]) {
      const p = fullPayload({ conf });
      // rewrite sources to nSources distinct values (round-robins).
      let i = 0;
      for (const key of Object.keys(p.confidence)) {
        p.confidence[key].source = nSources === 0 ? "" : `src${i++ % nSources}`;
      }
      const s = scoreBio(p);
      assert.ok(Number.isInteger(s), `integer score, got ${s}`);
      assert.ok(s >= 0 && s <= 100, `0..100, got ${s}`);
    }
  }
});

test("scoreBio: empty payload → 0 (deterministic)", () => {
  assert.equal(stableAcross(scoreBio, {}), 0);
  assert.equal(scoreBio({ confidence: {} }), 0);
});

test("scoreBio: order-independent in confidence-map key order", () => {
  const p = fullPayload({ conf: 66 });
  const keys = Object.keys(p.confidence);
  const reordered = { ...p, confidence: {} };
  for (const k of [...keys].reverse()) reordered.confidence[k] = p.confidence[k];
  assert.deepEqual(scoreBioBreakdown(reordered), scoreBioBreakdown(p));
});

test("scoreBio: confidence clamps — conf>100 ≡ 100, conf<0 ≡ 0", () => {
  assert.deepEqual(scoreBioBreakdown(fullPayload({ conf: 1000 })), scoreBioBreakdown(fullPayload({ conf: 100 })));
  assert.deepEqual(scoreBioBreakdown(fullPayload({ conf: -50 })),  scoreBioBreakdown(fullPayload({ conf: 0 })));
});

test("scoreBio: sourceDiversity saturates at 5 distinct sources", () => {
  const mk = (nSources) => {
    const p = fullPayload({ conf: 80 });
    let i = 0;
    for (const key of Object.keys(p.confidence)) p.confidence[key].source = `src${i++ % nSources}`;
    return scoreBioBreakdown(p);
  };
  assert.equal(mk(5).sourceDiversity, 1);
  assert.deepEqual(mk(8), mk(5)); // 8 distinct ≡ 5 distinct (saturated)
  assert.ok(mk(2).sourceDiversity < mk(5).sourceDiversity);
});

test("scoreBio subterm monotonicity: coverage non-decreasing as fields fill", () => {
  // Fill scored fields one at a time; coverage must never drop.
  let prev = -1;
  const payload = { confidence: {} };
  for (const [s, k] of SCORED_PATHS) {
    payload[s] = payload[s] || {};
    payload[s][k] = "v";
    const { coverage } = scoreBioBreakdown(payload);
    assert.ok(coverage >= prev, `coverage dropped ${prev} → ${coverage}`);
    prev = coverage;
  }
  assert.equal(prev, 1);
});

test("scoreBio monotonicity: raising a present field's conf never lowers score", () => {
  // Coverage + diversity held fixed (all fields present, single source);
  // only avgConf moves, so total score is monotonic in conf.
  let prev = -1;
  for (const conf of [0, 10, 25, 50, 75, 90, 100]) {
    const s = scoreBio(fullPayload({ conf, source: "one" }));
    assert.ok(s >= prev, `score dropped at conf=${conf}: ${prev} → ${s}`);
    prev = s;
  }
});

// ── evaluateCertification ────────────────────────────────────────────

const allHuman = (score, confidence = 2) => ({
  C3: { score, confidence }, C4: { score, confidence }, C5: { score, confidence },
  C6: { score, confidence }, C7: { score, confidence },
});

test("evaluateCertification: identical inputs → identical output across 200 runs", () => {
  const args = { autoSignals: { coverage: 0.7, avgConf: 0.6, sourceDiversity: 0.4 }, reviewerScores: allHuman(3) };
  stableAcross((a) => evaluateCertification(a), args);
});

test("evaluateCertification: order-independent in reviewerScores key order", () => {
  const base = allHuman(3);
  const shuffled = { C7: base.C7, C4: base.C4, C6: base.C6, C3: base.C3, C5: base.C5 };
  const args = { coverage: 0.8, avgConf: 0.8, sourceDiversity: 0.6 };
  assert.deepEqual(
    evaluateCertification({ autoSignals: args, reviewerScores: shuffled }),
    evaluateCertification({ autoSignals: args, reviewerScores: base }),
  );
});

test("evaluateCertification: reviewer-score clamp 0..4", () => {
  const hi = evaluateCertification({ autoSignals: { coverage: 1, avgConf: 1, sourceDiversity: 1 }, reviewerScores: allHuman(9) });
  const four = evaluateCertification({ autoSignals: { coverage: 1, avgConf: 1, sourceDiversity: 1 }, reviewerScores: allHuman(4) });
  assert.equal(hi.composite, four.composite); // 9 clamps to 4
  const lo = evaluateCertification({ autoSignals: { coverage: 0, avgConf: 0, sourceDiversity: 0 }, reviewerScores: allHuman(-3) });
  const zero = evaluateCertification({ autoSignals: { coverage: 0, avgConf: 0, sourceDiversity: 0 }, reviewerScores: allHuman(0) });
  assert.equal(lo.composite, zero.composite); // -3 clamps to 0
});

test("evaluateCertification: composite monotonic non-decreasing in human score", () => {
  let prev = -1;
  for (const sc of [0, 1, 2, 3, 4]) {
    const r = evaluateCertification({ autoSignals: { coverage: 1, avgConf: 1, sourceDiversity: 1 }, reviewerScores: allHuman(sc) });
    assert.ok(r.composite >= prev, `composite dropped at score=${sc}: ${prev} → ${r.composite}`);
    prev = r.composite;
  }
});

test("evaluateCertification: gate rules are deterministic (gate-0 → reject; below-floor caps)", () => {
  const gate0 = { ...allHuman(4), C6: { score: 0, confidence: 2 } };
  const belowFloor = { ...allHuman(4), C3: { score: 2, confidence: 2 } }; // C3 floor 3
  const hi = { coverage: 1, avgConf: 1, sourceDiversity: 1 };
  assert.equal(stableAcross((a) => evaluateCertification(a), { autoSignals: hi, reviewerScores: gate0 }).recommendedDecision, "reject");
  const r = evaluateCertification({ autoSignals: hi, reviewerScores: belowFloor });
  assert.equal(r.recommendedDecision, "return_changes");
});

test("evaluateCertification: default rubric weights sum to 1 (stable)", () => {
  const sum = DEFAULT_RUBRIC.criteria.reduce((a, c) => a + c.weight, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9, `weights sum ${sum}`);
});

// ── projectBio (event-sourced fold) ──────────────────────────────────

const A = (field_path, value, extra = {}) => ({ field_path, value, seq: 1, ...extra });

test("projectBio: order-independent (forward ≡ reversed ≡ shuffled), 200 runs", () => {
  const asserts = [
    A("identity.positioning", "P", { seq: 1, confidence: 80, source: "site" }),
    A("voice.register", "Warm", { seq: 3, confidence: 70, source: "about" }),
    A("identity.category", "Cat", { seq: 2, human_confirmed: true }),
    A("audience.primary", "Aud", { seq: 4, confidence: 55, source: "deck" }),
  ];
  const forward = projectBio(asserts);
  for (let i = 0; i < REPEAT; i++) {
    assert.deepEqual(projectBio([...asserts].reverse()), forward);
    assert.deepEqual(projectBio([asserts[2], asserts[0], asserts[3], asserts[1]]), forward);
  }
});

test("projectBio: resolution is deterministic (human-confirmed wins, else latest seq)", () => {
  const r1 = projectBio([
    A("identity.category", "Coffee", { seq: 1, human_confirmed: true }),
    A("identity.category", "Tea", { seq: 2 }),
  ]);
  assert.equal(r1.payload.identity.category, "Coffee");
  assert.equal(r1.conflicts.length, 0);

  const r2 = projectBio([
    A("identity.category", "Coffee", { seq: 1 }),
    A("identity.category", "Tea", { seq: 2 }),
  ]);
  assert.equal(r2.payload.identity.category, "Tea");
  assert.equal(r2.conflicts.length, 1);
});

test("projectBio: identical assertion set → identical projection (feeds identical score)", () => {
  const asserts = [
    A("identity.positioning", "P", { seq: 1, confidence: 90, source: "home" }),
    A("audience.primary", "A", { seq: 2, confidence: 60, source: "about" }),
  ];
  const proj = stableAcross((x) => projectBio(x), asserts);
  // The whole point: same assertions → same payload → same deterministic score.
  const s = stableAcross(scoreBio, proj.payload);
  assert.ok(Number.isInteger(s));
});

// ── normalizeBio ─────────────────────────────────────────────────────

test("normalizeBio: deterministic + idempotent (normalize∘normalize ≡ normalize)", () => {
  const raw = { identity: { positioning: "x", name: "Legacy" }, version: 7, score: 55 };
  const once = stableAcross(normalizeBio, raw);
  assert.deepEqual(normalizeBio(once), once);
});

test("normalizeBio: tolerates non-object input deterministically", () => {
  for (const bad of [null, undefined, "nope", 42]) {
    assert.deepEqual(normalizeBio(bad), normalizeBio(bad));
  }
});

// ── getBioForAgent ───────────────────────────────────────────────────

const SAMPLE = {
  version: 4,
  identity: { positioning: "P", category: "C", pillars: ["a", "b"] },
  audience: { primary: "A", secondary: "S" },
  voice: { register: "R", rhythm: "Ry", forbidden: ["x"], signatures: ["sig"] },
  goals: { northStar: "N" },
  confidence: { "identity.category": { conf: 40 }, "voice.register": { conf: 90 } },
};

test("getBioForAgent: identical inputs → identical blocks across 200 runs", () => {
  stableAcross(
    (b) => getBioForAgent({ bio: b, audience: "specialist", slices: ["voice"], refusals: ["never lie"] }),
    SAMPLE,
  );
});

test("getBioForAgent: slice-order independent", () => {
  const a = getBioForAgent({ bio: SAMPLE, audience: "specialist", slices: ["voice", "audience"] });
  const b = getBioForAgent({ bio: SAMPLE, audience: "specialist", slices: ["audience", "voice"] });
  assert.deepEqual(a, b);
});

test("computeAgentProvenance: deterministic over key set", () => {
  const keys = new Set(["voice.signatures", "strategic.notList"]);
  stableAcross((b) => computeAgentProvenance(b, keys), SAMPLE);
});

// ── payloadHash ──────────────────────────────────────────────────────

test("payloadHash: stable across 200 runs and object-key reorder", () => {
  const p = { b: 2, a: 1, nested: { z: 9, y: 8 } };
  const h = stableAcross(payloadHash, p);
  const reordered = { nested: { y: 8, z: 9 }, a: 1, b: 2 };
  assert.equal(payloadHash(reordered), h); // object key order irrelevant
});

test("payloadHash: array order IS significant (arrays are data)", () => {
  assert.notEqual(payloadHash({ a: [1, 2, 3] }), payloadHash({ a: [3, 2, 1] }));
});

test("payloadHash: any value change flips the hash", () => {
  const base = fullPayload({ conf: 80 });
  const mutated = clone(base);
  mutated.identity.positioning = "different";
  assert.notEqual(payloadHash(mutated), payloadHash(base));
});

test("payloadHash: two equivalent full BIOs (built in different key order) hash equal", () => {
  const p1 = fullPayload({ conf: 88, source: "home" });
  // rebuild with reversed section iteration
  const p2 = { confidence: {} };
  for (const [s, k] of [...SCORED_PATHS].reverse()) {
    p2[s] = p2[s] || {};
    p2[s][k] = p1[s][k];
    p2.confidence[`${s}.${k}`] = p1.confidence[`${s}.${k}`];
  }
  assert.equal(payloadHash(p2), payloadHash(p1));
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { teardownScorecard } from "./teardown-scorecard.js";
import { scoreBio } from "./score-bio.js";

const RICH = {
  identity: { positioning: "Specialty coffee for slow Tuesdays.", category: "Specialty coffee", founded: "2019", pillars: ["calm", "craft"] },
  audience: { primary: "Urban remote workers", secondary: "Cafés", tertiary: "Gifters", jtbd: ["start calmer"] },
  voice: { register: "Warm", forbidden: ["hustle"], rhythm: "short", signatures: ["lowercase"] },
  goals: { northStar: "Be the third-place", q2: "Wholesale", q3: "Subscriptions" },
  strategic: { watchouts: ["scaling craft"], notList: ["not a chain"] },
  confidence: {
    "identity.positioning": { conf: 90, source: "homepage" },
    "identity.category": { conf: 85, source: "about" },
    "audience.primary": { conf: 80, source: "ig" },
    "voice.register": { conf: 82, source: "about" },
    "goals.northStar": { conf: 70, source: "manifesto" },
    "strategic.watchouts": { conf: 60, source: "inferred" },
  },
};

test("overall equals scoreBio (single source of truth)", () => {
  assert.equal(teardownScorecard(RICH).overall, scoreBio(RICH));
});

test("empty payload → overall 0, all sections thin, headline set", () => {
  const sc = teardownScorecard({});
  assert.equal(sc.overall, 0);
  assert.equal(sc.sections.length, 5);
  assert.ok(sc.sections.every((s) => s.score === 0 && s.band === "thin"));
  assert.ok(sc.gapCount > 0);
  assert.ok(typeof sc.headline === "string" && sc.headline.length > 0);
});

test("section scores + bounds; covered never exceeds total", () => {
  const sc = teardownScorecard(RICH);
  for (const s of sc.sections) {
    assert.ok(s.score >= 0 && s.score <= 100, `${s.key} in range`);
    assert.ok(s.covered <= s.total);
  }
  const identity = sc.sections.find((s) => s.key === "identity");
  assert.equal(identity.covered, 4); // all four identity fields present
});

test("gaps surface model missing[] reasons, else a default reason", () => {
  const sc = teardownScorecard({
    identity: { positioning: "X." },
    missing: [{ field: "goals.northStar", why: "no roadmap surfaced" }],
  });
  const named = sc.gaps.find((g) => g.field === "goals.northStar");
  assert.equal(named.why, "no roadmap surfaced");
  const defaulted = sc.gaps.find((g) => g.field === "identity.category");
  assert.ok(defaulted && /No category/i.test(defaulted.why));
});

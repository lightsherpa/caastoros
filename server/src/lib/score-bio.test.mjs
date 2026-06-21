import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreBio } from "./score-bio.js";

test("empty payload scores 0", () => {
  assert.equal(scoreBio({}), 0);
  assert.equal(scoreBio(), 0);
});

test("rich payload outscores thin, and both stay in bounds", () => {
  // thin: a single low-confidence field from a single source
  const thin = {
    identity: { positioning: "Coffee." },
    confidence: {
      "identity.positioning": { conf: 20, source: "homepage" },
    },
  };

  // rich: 4+ populated fields, high confidence, multiple distinct sources
  const rich = {
    identity: { positioning: "Specialty coffee for slow Tuesdays.", category: "Specialty coffee" },
    audience: { primary: "Urban remote workers, 28-40", jtbd: "A calmer ritual to start the day" },
    voice: { register: "Warm, unhurried", forbidden: ["hustle", "grind"] },
    goals: { northStar: "Become the city's third-place" },
    confidence: {
      "identity.positioning": { conf: 90, source: "homepage" },
      "identity.category":    { conf: 85, source: "about page" },
      "audience.primary":     { conf: 80, source: "instagram" },
      "audience.jtbd":        { conf: 88, source: "brand deck" },
      "voice.register":       { conf: 82, source: "about page" },
      "voice.forbidden":      { conf: 90, source: "tone guide" },
      "goals.northStar":      { conf: 84, source: "founder note" },
    },
  };

  const thinScore = scoreBio(thin);
  const richScore = scoreBio(rich);

  assert.equal(typeof richScore, "number");
  assert.ok(Number.isInteger(richScore), "score is an integer");
  assert.ok(richScore > thinScore, `expected rich (${richScore}) > thin (${thinScore})`);
  assert.ok(richScore > 0 && richScore <= 100, `expected 0 < rich (${richScore}) <= 100`);
  assert.ok(thinScore >= 0 && thinScore <= 100, `expected thin (${thinScore}) within 0..100`);
});

import { test } from "node:test";
import assert from "node:assert/strict";

import { computeFocus } from "./bio-focus.js";

function buildPayload() {
  return {
    identity: {
      positioning: "Specialty coffee for slow Tuesdays.",
      category: "Specialty coffee roaster",
      founded: "2018",
    },
    voice: {
      // forbidden is missing → declared in payload.missing below
    },
    audience: {
      primary: "Urban professionals who treat coffee as a ritual.",
    },
    goals: {
      q3: "Open a second location.",
    },
    confidence: {
      "identity.positioning": { conf: 55, source: "homepage hero" },
      "audience.primary": { conf: 40, source: "inferred — not stated" },
      "identity.category": { conf: 94, source: "about page" },
      "identity.founded": { conf: 70, source: "press kit" },
      "goals.q3": { conf: 62, source: "roadmap doc" },
    },
    missing: [{ field: "voice.forbidden", why: "no tone guide surfaced" }],
  };
}

test("gap comes first; items[0] is the missing field", () => {
  const focus = computeFocus(buildPayload());
  const order = focus.map((f) => f.field);

  assert.equal(order[0], "voice.forbidden", "missing field should rank first");
  assert.equal(focus[0].status, "missing");
});

test("audience.primary outranks identity.positioning (0.60 > 0.45)", () => {
  const focus = computeFocus(buildPayload());
  const order = focus.map((f) => f.field);

  const ap = order.indexOf("audience.primary");
  const ip = order.indexOf("identity.positioning");

  assert.ok(ap !== -1 && ip !== -1, "both low-conf fields should be present");
  assert.ok(ap < ip, "audience.primary (priority 0.60) should rank above identity.positioning (priority 0.45)");
});

test("identity.category is dropped (conf >= 92)", () => {
  const focus = computeFocus(buildPayload());
  const order = focus.map((f) => f.field);

  assert.equal(order.includes("identity.category"), false, "high-confidence field should be dropped");
});

test("low_conf items carry conf, value, source, and a templated action", () => {
  const focus = computeFocus(buildPayload());
  const ap = focus.find((f) => f.field === "audience.primary");

  assert.equal(ap.status, "low_conf");
  assert.equal(ap.conf, 40);
  assert.equal(ap.value, "Urban professionals who treat coffee as a ritual.");
  assert.equal(ap.source, "inferred — not stated");
  // inferred source → "Confirm ... — inferred, not stated."
  assert.match(ap.action, /inferred, not stated/);
});

test("empty payload yields no focus items", () => {
  assert.deepEqual(computeFocus(), []);
  assert.deepEqual(computeFocus({}), []);
});

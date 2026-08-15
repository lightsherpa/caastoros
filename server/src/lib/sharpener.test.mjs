// server/src/lib/sharpener.test.mjs
// CAA-26 (P2): the Sharpener's cite-BIO contract was prompt-only. questionCitesBio
// is the cheap server-side gate — it must pass questions that reference a real BIO
// field and reject generic ones, while failing open when no BIO is available.
import { test } from "node:test";
import assert from "node:assert/strict";
import { questionCitesBio } from "./sharpener.js";

const BIO = {
  version: 1,
  identity: { positioning: "Specialty coffee for people who take mornings seriously", category: "Coffee", pillars: ["ritual", "craft"] },
  audience: { primary: "home baristas", jtbd: ["a better pour-over"] },
  voice: { register: "warm, editorial", forbidden: ["cheap", "hack"], signatures: ["the slow pour"] },
  goals: { northStar: "own the morning ritual" },
  strategic: { watchouts: ["never sound like a chain"], notList: ["not a convenience brand"] },
};

test("rejects a generic why that cites no BIO field", () => {
  assert.equal(questionCitesBio({ q: "what's the budget?", why: "because clarity matters" }, BIO), false);
});

test("accepts a why naming a structural BIO section (voice register)", () => {
  assert.equal(questionCitesBio({ q: "how playful?", why: "ties to the voice register, which is warm and editorial" }, BIO), true);
});

test("accepts a why that shares a meaningful token with the BIO (no section keyword)", () => {
  // "mornings"/"seriously" appear in the positioning; the why names neither a section.
  assert.equal(questionCitesBio({ q: "which ritual?", why: "connects to how seriously mornings are treated" }, BIO), true);
});

test("rejects an empty, missing, or too-short why", () => {
  assert.equal(questionCitesBio({ q: "x", why: "" }, BIO), false);
  assert.equal(questionCitesBio({ q: "x" }, BIO), false);
  assert.equal(questionCitesBio({ q: "x", why: "a bio" }, BIO), false);
});

test("fails open when there is no BIO to check against", () => {
  assert.equal(questionCitesBio({ q: "x", why: "any sufficiently long rationale here" }, null), true);
  assert.equal(questionCitesBio({ q: "x", why: "any sufficiently long rationale here" }, {}), true);
});

test("a forbidden-word reference counts as a citation", () => {
  assert.equal(questionCitesBio({ q: "tone check", why: "the forbidden words list rules out that angle" }, BIO), true);
});

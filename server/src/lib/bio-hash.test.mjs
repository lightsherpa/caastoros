import { test } from "node:test";
import assert from "node:assert/strict";
import { payloadHash } from "./bio-hash.js";

test("same content, different key order → same hash", () => {
  const a = { identity: { positioning: "x", category: "y" }, voice: { forbidden: ["a", "b"] } };
  const b = { voice: { forbidden: ["a", "b"] }, identity: { category: "y", positioning: "x" } };
  assert.equal(payloadHash(a), payloadHash(b));
});

test("any value change → different hash", () => {
  const a = { identity: { positioning: "x" } };
  const b = { identity: { positioning: "x!" } };
  assert.notEqual(payloadHash(a), payloadHash(b));
});

test("array order is significant", () => {
  assert.notEqual(payloadHash({ v: [1, 2] }), payloadHash({ v: [2, 1] }));
});

test("deterministic + hex sha256", () => {
  const h = payloadHash({ a: 1 });
  assert.equal(h, payloadHash({ a: 1 }));
  assert.match(h, /^[0-9a-f]{64}$/);
});

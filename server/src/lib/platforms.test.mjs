// server/src/lib/platforms.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { PLATFORM_SPECS, platformSpec, isPlatform, DEFAULT_PLATFORM } from "./platforms.js";

test("known platforms expose image dims + tone", () => {
  for (const id of ["instagram", "linkedin", "x", "tiktok", "blog", "deck", "email", "generic"]) {
    const s = PLATFORM_SPECS[id];
    assert.ok(s, `missing platform ${id}`);
    assert.equal(typeof s.image.w, "number");
    assert.equal(typeof s.image.h, "number");
    assert.equal(typeof s.tone, "string");
  }
});

test("instagram is square 1080, linkedin is 1200x627", () => {
  assert.deepEqual(platformSpec("instagram").image, { w: 1080, h: 1080 });
  assert.deepEqual(platformSpec("linkedin").image, { w: 1200, h: 627 });
});

test("platformSpec falls back to generic for unknown ids", () => {
  assert.equal(platformSpec("myspace"), PLATFORM_SPECS.generic);
});

test("isPlatform + DEFAULT_PLATFORM", () => {
  assert.equal(isPlatform("tiktok"), true);
  assert.equal(isPlatform("myspace"), false);
  assert.equal(DEFAULT_PLATFORM, "generic");
});

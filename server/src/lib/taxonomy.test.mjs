// server/src/lib/taxonomy.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { DELIVERABLE_TYPES, typeSpec, isType, DEFAULT_TYPE } from "./taxonomy.js";

test("every type declares parts + crew covering each part", () => {
  for (const [id, spec] of Object.entries(DELIVERABLE_TYPES)) {
    assert.ok(Array.isArray(spec.parts) && spec.parts.length > 0, `${id} has no parts`);
    for (const part of spec.parts) {
      assert.ok(spec.crew[part], `${id}.crew missing part ${part}`);
      assert.match(spec.crew[part], /^a\d{2}$/, `${id}.crew.${part} not an agent id`);
    }
    for (const p of spec.platformSensitive) {
      assert.ok(spec.parts.includes(p), `${id}.platformSensitive lists unknown part ${p}`);
    }
  }
});

test("social_post pairs caption + image and is visual", () => {
  const s = typeSpec("social_post");
  assert.deepEqual(s.parts, ["caption", "image"]);
  assert.equal(s.crew.image, "a41");
  assert.equal(s.visual, true);
});

test("blog_article carries a hero image", () => {
  const s = typeSpec("blog_article");
  assert.ok(s.parts.includes("hero_image"));
  assert.equal(s.visual, true);
});

test("legacy type exists for back-compat and is single-part", () => {
  const s = typeSpec("legacy");
  assert.deepEqual(s.parts, ["output"]);
});

test("isType + DEFAULT_TYPE + unknown returns null", () => {
  assert.equal(isType("deck"), true);
  assert.equal(isType("nope"), false);
  assert.equal(typeSpec("nope"), null);
  assert.equal(DEFAULT_TYPE, "social_post");
});

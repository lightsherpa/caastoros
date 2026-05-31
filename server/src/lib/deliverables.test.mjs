// server/src/lib/deliverables.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  maxTokensForDeliverables, parseDeliverables, buildDeliverableContract,
  falSizeForPlatform, TOKEN_CEILING,
} from "./deliverables.js";

test("maxTokensForDeliverables scales with count and floors perItem at 250", () => {
  assert.equal(maxTokensForDeliverables({ count: 1, baseCr: 8 }), 400 + 1 * 800);
  assert.equal(maxTokensForDeliverables({ count: 5, baseCr: 3 }), 400 + 5 * 300); // baseCr*100=300, above the 250 floor
  assert.equal(maxTokensForDeliverables({ count: 4, baseCr: 2 }), 400 + 4 * 250); // baseCr*100=200 -> floored to 250
});

test("maxTokensForDeliverables is capped at the ceiling and never below one item", () => {
  assert.equal(maxTokensForDeliverables({ count: 20, baseCr: 14 }), TOKEN_CEILING); // would exceed -> capped
  assert.equal(maxTokensForDeliverables({ count: 0, baseCr: 8 }), 400 + 1 * 800);   // count<1 -> 1
  assert.equal(maxTokensForDeliverables({}), 400 + 1 * 800);                         // defaults
});

test("parseDeliverables reads a clean JSON deliverables array", () => {
  const raw = '{"deliverables":[{"title":"Mon","body":"post one"},{"title":"Tue","body":"post two"}]}';
  const out = parseDeliverables(raw);
  assert.equal(out.malformed, false);
  assert.equal(out.deliverables.length, 2);
  assert.deepEqual(out.deliverables[0], { title: "Mon", body: "post one" });
});

test("parseDeliverables strips ```json fences", () => {
  const raw = "```json\n{\"deliverables\":[{\"title\":\"x\",\"body\":\"y\"}]}\n```";
  const out = parseDeliverables(raw);
  assert.equal(out.malformed, false);
  assert.equal(out.deliverables[0].body, "y");
});

test("parseDeliverables degrades gracefully on non-JSON (never loses output)", () => {
  const out = parseDeliverables("just some prose the model wrote");
  assert.equal(out.malformed, true);
  assert.equal(out.deliverables.length, 1);
  assert.equal(out.deliverables[0].body, "just some prose the model wrote");
});

test("parseDeliverables treats empty/absent array as malformed fallback", () => {
  assert.equal(parseDeliverables('{"deliverables":[]}').malformed, true);
  assert.equal(parseDeliverables('{"foo":1}').malformed, true);
});

test("buildDeliverableContract names count, type, platform and demands strict JSON", () => {
  const c = buildDeliverableContract({ type: "social_post", part: "caption", count: 5, platform: "instagram" });
  assert.match(c, /STRICT JSON/i);
  assert.match(c, /deliverables/);
  assert.match(c, /5/);
  assert.match(c, /Instagram/);
  assert.match(c, /Social post/i);
});

test("falSizeForPlatform maps platform dims to the nearest fal named size", () => {
  assert.equal(falSizeForPlatform("instagram"), "square_hd");      // 1:1
  assert.equal(falSizeForPlatform("linkedin"), "landscape_16_9");  // 1.91:1
  assert.equal(falSizeForPlatform("x"), "landscape_16_9");         // 16:9
  assert.equal(falSizeForPlatform("tiktok"), "portrait_16_9");     // 9:16
  assert.equal(falSizeForPlatform("instagram_story"), "portrait_16_9");
  assert.equal(falSizeForPlatform("email"), "landscape_4_3");      // 3:2
  assert.equal(falSizeForPlatform("generic"), "square_hd");
});

test("parseDeliverables coerces a non-string body to just its value, not the whole element", () => {
  const out = parseDeliverables('{"deliverables":[{"title":"t","body":42}]}');
  assert.equal(out.malformed, false);
  assert.equal(out.deliverables[0].title, "t");
  assert.equal(out.deliverables[0].body, "42");
});

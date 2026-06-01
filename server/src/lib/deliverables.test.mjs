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

test("parseDeliverables reads a bare top-level array", () => {
  const out = parseDeliverables('[{"title":"A","body":"x"},{"title":"B","body":"y"}]');
  assert.equal(out.malformed, false);
  assert.equal(out.deliverables.length, 2);
  assert.equal(out.deliverables[1].body, "y");
});

test("parseDeliverables accepts alternate array keys + body field names", () => {
  const out = parseDeliverables('{"captions":[{"caption":"hi there"},{"text":"second"}]}');
  assert.equal(out.malformed, false);
  assert.deepEqual(out.deliverables.map((d) => d.body), ["hi there", "second"]);
});

test("parseDeliverables extracts a JSON block embedded in prose", () => {
  const out = parseDeliverables('Sure! {"deliverables":[{"body":"clean caption"}]} hope that helps');
  assert.equal(out.malformed, false);
  assert.equal(out.deliverables[0].body, "clean caption");
});

test("parseDeliverables NEVER surfaces raw JSON braces on malformed output", () => {
  const out = parseDeliverables('{"deliverables": [oops this is not valid json');
  assert.equal(out.malformed, true);
  assert.doesNotMatch(out.deliverables[0].body, /[{}\[\]]/);   // the guarantee
});

test("buildDeliverableContract adds a visualDirection field when withVisualDirection", () => {
  const c = buildDeliverableContract({ type: "ad", part: "primary text", count: 2, platform: "meta_feed", withVisualDirection: true });
  assert.match(c, /visualDirection/);
});

test("buildDeliverableContract omits visualDirection by default", () => {
  const c = buildDeliverableContract({ type: "ad", part: "body", count: 1, platform: "generic" });
  assert.doesNotMatch(c, /visualDirection/);
});

test("parseDeliverables preserves a visualDirection field on each item", () => {
  const raw = JSON.stringify({ deliverables: [{ title: "A", body: "buy now", visualDirection: "warm stone still life" }] });
  const { deliverables } = parseDeliverables(raw);
  assert.equal(deliverables[0].visualDirection, "warm stone still life");
});

test("parseDeliverables leaves visualDirection undefined when absent", () => {
  const { deliverables } = parseDeliverables(JSON.stringify({ deliverables: [{ title: "A", body: "x" }] }));
  assert.equal(deliverables[0].visualDirection, undefined);
});

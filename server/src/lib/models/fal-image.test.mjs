import { test } from "node:test";
import assert from "node:assert/strict";
import { FAL_ROUTES, isImageRoute } from "./fal-image.js";

test("gpt-image-2 route is registered with the correct fal endpoint", () => {
  const r = FAL_ROUTES["vendor/fal/gpt-image-2"];
  assert.ok(r, "vendor/fal/gpt-image-2 must exist in FAL_ROUTES");
  assert.equal(r.endpoint, "/openai/gpt-image-2");
});

test("gpt-image-2 payload builds the documented fal params", () => {
  const r = FAL_ROUTES["vendor/fal/gpt-image-2"];
  const body = r.payload({ prompt: "a cold brew on stone", size: "square_hd" });
  assert.equal(body.prompt, "a cold brew on stone");
  assert.equal(body.image_size, "square_hd");
  assert.equal(body.quality, "high");
  assert.equal(body.num_images, 1);
  assert.equal(body.output_format, "png");
});

test("gpt-image-2 payload defaults size to landscape_16_9", () => {
  const body = FAL_ROUTES["vendor/fal/gpt-image-2"].payload({ prompt: "x" });
  assert.equal(body.image_size, "landscape_16_9");
});

test("isImageRoute recognizes the gpt-image-2 route", () => {
  assert.equal(isImageRoute("vendor/fal/gpt-image-2"), true);
});

test("gpt-image-2 carries a longer per-route timeout than the 90s default", () => {
  // gpt-image-2 "high" completes in ~90-100s; the 90s default times out on it.
  assert.ok(FAL_ROUTES["vendor/fal/gpt-image-2"].timeout_ms > 90_000);
});

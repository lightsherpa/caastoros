import { test } from "node:test";
import assert from "node:assert/strict";

import {
  extractPalette,
  extractFonts,
} from "./extract-visual-deterministic.js";

const SAMPLE_HTML = `
<!doctype html>
<html>
  <head>
    <style>
      :root { --brand: #1A2B3C; --accent: rgb(201, 123, 63); }
      @font-face { font-family: 'GT Sectra'; src: url(/gt.woff2); }
      body { font-family: 'GT Sectra', serif; color: #1A2B3C; background: #ffffff; }
      h1 { font-family: "Söhne Breit", sans-serif; color: #1a2b3c; }
      .cta { background: rgb(201,123,63); border: 1px solid #1A2B3C; }
      .panel { background: rgb(201, 123, 63); color: #ffffff; }
    </style>
  </head>
  <body style="background: #000000;">
    <h1 style="color:#1a2b3c">Hi</h1>
  </body>
</html>`;

test("extractPalette returns hex-regex-valid entries incl. brand + accent", () => {
  const palette = extractPalette(SAMPLE_HTML);
  assert.ok(Array.isArray(palette));
  assert.ok(palette.length > 0, "palette should be non-empty");

  const hexRe = /^#[0-9a-f]{6}$/;
  for (const entry of palette) {
    assert.match(entry.hex, hexRe, `bad hex: ${entry.hex}`);
    assert.equal(typeof entry.name, "string");
    assert.ok(entry.name.length > 0);
  }

  const hexes = palette.map((p) => p.hex);
  assert.ok(hexes.includes("#1a2b3c"), "should include normalized brand #1a2b3c");
  assert.ok(
    hexes.includes("#c97b3f"),
    "should include rgb(201,123,63) -> #c97b3f"
  );
});

test("extractPalette keeps at most 5", () => {
  const palette = extractPalette(SAMPLE_HTML);
  assert.ok(palette.length <= 5);
});

test("extractPalette normalizes #abc shorthand to #aabbcc", () => {
  const palette = extractPalette(`<style>a{color:#abc}b{color:#abc}</style>`);
  assert.equal(palette[0].hex, "#aabbcc");
});

test("extractFonts returns Display 'Söhne Breit' and Body 'GT Sectra'", () => {
  const fonts = extractFonts(SAMPLE_HTML);
  assert.ok(Array.isArray(fonts));

  const display = fonts.find((f) => f.kind === "Display");
  const body = fonts.find((f) => f.kind === "Body");

  assert.ok(display, "should have a Display font");
  assert.equal(display.family, "Söhne Breit");

  assert.ok(body, "should have a Body font");
  assert.equal(body.family, "GT Sectra");
});

test("extractFonts skips generic/fallback-only families", () => {
  const fonts = extractFonts(SAMPLE_HTML);
  const families = fonts.map((f) => f.family.toLowerCase());
  for (const generic of ["serif", "sans-serif", "arial", "helvetica"]) {
    assert.ok(!families.includes(generic), `should not include ${generic}`);
  }
});

test("extractFonts reads Google Fonts <link> family names", () => {
  const html = `<head>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Inter:wght@400&display=swap">
  </head>`;
  const fonts = extractFonts(html);
  const families = fonts.map((f) => f.family);
  assert.ok(families.includes("Playfair Display"));
  assert.ok(families.includes("Inter"));
});

test("extractPalette('') === [] (no junk)", () => {
  assert.deepEqual(extractPalette(""), []);
});

test("extractFonts('') === [] (no junk)", () => {
  assert.deepEqual(extractFonts(""), []);
});

test("extractPalette tolerates non-string input", () => {
  assert.deepEqual(extractPalette(undefined), []);
  assert.deepEqual(extractPalette(null), []);
});

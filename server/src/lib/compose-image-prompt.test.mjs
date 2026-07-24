import { test } from "node:test";
import assert from "node:assert/strict";
import { composeImagePrompt } from "./compose-image-prompt.js";

const base = {
  spec: { payload: { role: "Social post designer" } },
  brand: { name: "Acme" },
  bio: { visual: {} },
  refusals: [],
  brief: "A spring drop hero",
};

test("builds a complete art-direction prompt with production defaults", () => {
  const prompt = composeImagePrompt(base);

  for (const section of [
    "SUBJECT & ACTION",
    "COMPOSITION & HIERARCHY",
    "CAMERA / VIEWPOINT",
    "LIGHT",
    "MATERIAL & TEXTURE",
    "PALETTE",
    "ENVIRONMENT",
    "BRAND EVIDENCE",
    "OUTPUT",
    "NEGATIVE CONSTRAINTS",
  ]) {
    assert.match(prompt, new RegExp(section.replace("&", "&")));
  }
  assert.match(prompt, /50mm-equivalent/);
  assert.match(prompt, /1:1 square/);
  assert.match(prompt, /Acme brand world/);
});

test("uses explicit art direction as the subject and preserves text-free output", () => {
  const prompt = composeImagePrompt({
    ...base,
    artDirection: "Full-bleed photo of a single cold brew glass on sun-warmed stone",
  });

  assert.match(prompt, /^SUBJECT & ACTION: Full-bleed photo/);
  assert.match(prompt, /ART DIRECTION — FOLLOW PRECISELY/);
  assert.match(prompt, /sun-warmed stone/);
  assert.match(prompt, /do not render any text/i);
  assert.match(prompt, /No text, typography, captions/);
});

test("uses copy as context without asking the model to render it", () => {
  const prompt = composeImagePrompt({ ...base, sourceText: "Bloom season is here" });

  assert.match(prompt, /COPY CONTEXT/);
  assert.match(prompt, /accompanies this copy/i);
  assert.match(prompt, /Bloom season is here/);
  assert.match(prompt, /do not render the text itself/);
});

test("turns visual BIO and refusals into brand evidence and constraints", () => {
  const prompt = composeImagePrompt({
    ...base,
    bio: {
      identity: { positioning: "Tools for deliberate work", pillars: ["Clarity", "Craft"] },
      voice: { register: "Quiet and exact" },
      visual: {
        palette: [{ name: "Ink", hex: "#101820" }, { name: "Signal", hex: "#F2C14E" }],
        imagery: ["hands using precision tools", "honest workshop surfaces"],
        avoid: ["neon gradients", "staged team photos"],
      },
    },
    refusals: ["Never imply disposable construction"],
  });

  assert.match(prompt, /Ink #101820, Signal #F2C14E/);
  assert.match(prompt, /Tools for deliberate work/);
  assert.match(prompt, /pillars: Clarity, Craft/);
  assert.match(prompt, /hands using precision tools/);
  assert.match(prompt, /also exclude: neon gradients \| staged team photos \| Never imply disposable construction/);
  assert.match(prompt, /VISUAL REGISTER: Quiet and exact/);
});

test("honors output format, crop, and aspect ratio supplied by the spec", () => {
  const prompt = composeImagePrompt({
    ...base,
    spec: {
      payload: {
        role: "Campaign story",
        outputFormat: "photorealistic JPEG",
        crop: "safe-center crop",
        aspectRatio: "9:16 portrait",
      },
    },
  });

  assert.match(prompt, /OUTPUT: photorealistic JPEG; safe-center crop; 9:16 portrait/);
});

test("uses role-specific camera defaults and accepts explicit production direction", () => {
  const product = composeImagePrompt({
    ...base,
    spec: { payload: { role: "premium product packaging still life", lighting: "hard side light at 4,800K", materials: "uncoated paper and embossed foil" } },
  });
  assert.match(product, /85mm-equivalent/);
  assert.match(product, /hard side light at 4,800K/);
  assert.match(product, /uncoated paper and embossed foil/);
});

test("remains callable with sparse legacy input", () => {
  const prompt = composeImagePrompt({ brief: "A ceramic cup on a table" });

  assert.equal(typeof prompt, "string");
  assert.match(prompt, /^SUBJECT & ACTION: A ceramic cup on a table/);
  assert.match(prompt, /4:3 landscape/);
  assert.doesNotMatch(prompt, /undefined|null/);
});

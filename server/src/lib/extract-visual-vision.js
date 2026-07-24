// ─────────────────────────────────────────────────────────────────────
// Visual extraction (vision half) — imagery direction + avoid-list.
//
// One Gemini 2.5 Flash vision call (~$0.0014/BIO via OpenRouter) on the
// brand's homepage screenshot. Palette + type are handled deterministically
// from rawHtml elsewhere ($0) — NOT here. This call only describes the
// IMAGERY style (subjects, lighting, composition) and infers what the brand
// should AVOID, grounded in the already-synthesized voice + notList.
//
// Mirrors qa-vision.js exactly: same streamCompletion/router usage, same
// image_url content-block shape, same strict-JSON + defensive parse, same
// graceful degradation. On ANY failure it returns { imagery: [], avoid: [] }
// so the BIO stays valid if vision fails (Increment 4 degrades to []).
// ─────────────────────────────────────────────────────────────────────

import { streamCompletion } from "./models/router.js";

const VISUAL_VISION_SPEC = {
  payload: {
    name: "Visual Imagery Extractor",
    modelRouting: {
      primary: "openrouter/google/gemini-3.5-flash-lite",
      reason: "one-shot vision read of brand imagery; cheap + reliable JSON",
    },
    cr_estimate: 1,
  },
};

const VISUAL_VISION_SYSTEM = `You are a brand visual analyst — you read a brand's homepage screenshot and describe its IMAGERY style.

Return STRICT JSON ONLY, no preamble, no fences. Shape:
{"imagery":string[],"avoid":string[]}

- imagery: 3–6 short phrases describing the brand's imagery direction — subjects, lighting, composition. Examples: "hands + craft tools", "low-light café interiors", "no models", "warm natural daylight", "tight product close-ups".
- avoid: 2–4 short things the brand should AVOID, grounded in the provided voice + avoid list. Examples: "stock-photo lighting", "heavy filters", "corporate suits", "neon gradients".

Be specific and cite what you see ("hands holding mug, warm side-lit") not what you assume. Each phrase max 8 words.`;

export async function extractImageryAvoid({ screenshotUrl, voice = null, notList = [] }) {
  if (!screenshotUrl) {
    return { imagery: [], avoid: [] };
  }

  const voiceLine = voice
    ? `Brand voice: ${typeof voice === "string" ? voice : JSON.stringify(voice)}`
    : "";
  const notListLine = Array.isArray(notList) && notList.length
    ? `Brand avoids (notList): ${notList.join(" · ")}`
    : "";

  /* Multimodal user message — text seed + screenshot. Gemini Flash via
     OpenRouter accepts the same image_url shape as OpenAI. Pass the signed
     PNG URL straight through — do NOT download/base64 it. */
  const userContent = [
    {
      type: "text",
      text: [
        `Analyze this brand's homepage screenshot.`,
        voiceLine,
        notListLine,
        ``,
        `Describe the IMAGERY style as 3–6 short phrases (subjects, lighting, composition),`,
        `and infer 2–4 things the brand should AVOID, grounded in the voice + avoid list above.`,
        `Return the JSON only.`,
      ].filter(Boolean).join("\n"),
    },
    { type: "image_url", image_url: { url: screenshotUrl } },
  ];

  let text = "";
  try {
    for await (const ev of streamCompletion({
      spec: VISUAL_VISION_SPEC,
      system: VISUAL_VISION_SYSTEM,
      messages: [{ role: "user", content: userContent }],
      maxTokens: 300,
    })) {
      if (ev.type === "token")      text += ev.text;
      else if (ev.type === "error") throw new Error(ev.message);
    }
  } catch {
    /* Vision failures shouldn't invalidate the BIO — the rest of the
       visual block (palette/type) is extracted deterministically. Degrade
       to empty arrays so synthesis stays valid. */
    return { imagery: [], avoid: [] };
  }

  const stripped = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  let parsed;
  try { parsed = JSON.parse(stripped); }
  catch { return { imagery: [], avoid: [] }; }

  return {
    imagery: Array.isArray(parsed.imagery) ? parsed.imagery : [],
    avoid:   Array.isArray(parsed.avoid)   ? parsed.avoid   : [],
  };
}

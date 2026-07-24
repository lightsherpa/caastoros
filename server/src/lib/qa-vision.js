// ─────────────────────────────────────────────────────────────────────
// a24 Brand Consistency QA — runs after every image specialist output.
//
// Vision check via Gemini 2.5 Flash (~$0.00015/check via OpenRouter).
// 13× cheaper than Haiku for vision; same quality verdict on
// pass/fail + violations.
//
// Compares the rendered image against the brand's visual rules:
// palette adherence (the colors the model chose), imagery direction
// (style fit), avoid-list violations (explicitly forbidden looks).
//
// Returns { passed, brand_match, violations, usage }. `passed` is
// false if brand_match < 65 OR there's any hard avoid-list violation.
// ─────────────────────────────────────────────────────────────────────

import { streamCompletion } from "./models/router.js";

const QA_SPEC = {
  payload: {
    name: "a24 Brand Consistency QA",
    modelRouting: {
      primary: "openrouter/google/gemini-3.5-flash-lite",
      reason: "high-volume vision QA; cheap + reliable JSON verdicts",
    },
    cr_estimate: 1,
  },
};

const QA_SYSTEM = `You are a24 Brand Consistency QA — you evaluate a rendered image against a brand's visual rules.

Return STRICT JSON ONLY, no preamble, no fences. Shape:
{"passed":boolean,"brand_match":number,"violations":string[]}

- brand_match: integer 0–100. How well does the image match the brand's palette + imagery direction + register?
- violations: short strings, max 12 words each. Examples: "uses off-system colours (bright magenta not in palette)", "stock-photo lighting; imagery direction calls for natural daylight", "shows what the brand avoids: heavy filters".
- passed: true only if NO avoid-list violations AND brand_match >= 65.

Be specific. Cite what you see ("hands holding mug, warm side-lit") not what you assume. Be calibrated — 65 is "ships"; 85+ is "this is on-brand without note"; below 50 is "off-brand, regenerate".`;

export async function visionQa({ assetUrl, bio }) {
  if (!assetUrl) {
    return { passed: false, brand_match: 0, violations: ["no asset URL to evaluate"], usage: null };
  }

  const v = bio?.visual || {};
  const palette = (v.palette || []).map((p) => `${p.name || ""} ${p.hex || ""}`.trim()).filter(Boolean).join(", ");
  const imagery = (v.imagery || []).join(" · ");
  const avoid   = (v.avoid || []).join(" · ");

  /* Multimodal user message — text rules + image. Gemini Flash via
     OpenRouter accepts the same image_url shape as OpenAI. */
  const userContent = [
    {
      type: "text",
      text: [
        `BRAND VISUAL RULES`,
        palette  ? `Palette: ${palette}` : "Palette: (none specified)",
        imagery  ? `Imagery direction: ${imagery}` : "Imagery direction: (none specified)",
        avoid    ? `AVOID: ${avoid}` : "",
        bio?.voice?.register ? `Visual register matches brand voice: ${bio.voice.register}` : "",
        bio?.identity?.positioning ? `Brand positioning: ${bio.identity.positioning}` : "",
        ``,
        `Evaluate the attached image against these rules. Return the JSON verdict only.`,
      ].filter(Boolean).join("\n"),
    },
    { type: "image_url", image_url: { url: assetUrl } },
  ];

  let text = "";
  let usage = null;
  try {
    for await (const ev of streamCompletion({
      spec: QA_SPEC,
      system: QA_SYSTEM,
      messages: [{ role: "user", content: userContent }],
      maxTokens: 300,
    })) {
      if (ev.type === "token")      text += ev.text;
      else if (ev.type === "done")  usage = ev.usage;
      else if (ev.type === "error") throw new Error(ev.message);
    }
  } catch (e) {
    /* Vision QA failures shouldn't block the run — the image is already
       generated and uploaded. Surface as a "needs human review" verdict
       so the output goes to flagged not auto-approved. */
    return {
      passed: false,
      brand_match: 0,
      violations: [`vision QA failed: ${e?.message || String(e)}`],
      usage: null,
    };
  }

  const stripped = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  let parsed;
  try { parsed = JSON.parse(stripped); }
  catch { parsed = { passed: false, brand_match: 0, violations: [`vision QA returned non-JSON: ${stripped.slice(0, 120)}`] }; }

  return {
    passed:      parsed.passed === true,
    brand_match: Number(parsed.brand_match) || 0,
    violations:  Array.isArray(parsed.violations) ? parsed.violations : [],
    usage,
  };
}

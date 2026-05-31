// server/src/lib/deliverables.js
// Pure run-engine helpers. No I/O. Used by routes/runs.js to turn a single
// specialist call into N structured, per-item-QA'd deliverables, and to size
// images per platform. Composes over the Plan 1 registries.

import { typeSpec } from "./taxonomy.js";
import { platformSpec } from "./platforms.js";

export const TOKEN_CEILING = 8000;   // hard cap so a big count can't run away

// Size the model's output budget by how many deliverables we asked for. Each
// item gets a per-item budget (floored at 250) plus a small JSON overhead.
export function maxTokensForDeliverables({ count = 1, baseCr = 8 } = {}) {
  const n = Math.max(1, Math.round(Number(count)) || 1);
  const perItem = Math.max(250, (Number(baseCr) || 8) * 100);
  return Math.min(TOKEN_CEILING, 400 + n * perItem);
}

// Parse the specialist's structured output. Always returns at least one
// deliverable — on malformed output we wrap the raw text so nothing is lost.
export function parseDeliverables(rawText) {
  const stripped = String(rawText || "")
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
  let parsed = null;
  try { parsed = JSON.parse(stripped); } catch { parsed = null; }
  const arr = parsed && Array.isArray(parsed.deliverables) ? parsed.deliverables : null;
  if (!arr || arr.length === 0) {
    return { deliverables: [{ title: "", body: stripped }], malformed: true };
  }
  const deliverables = arr.map((d) => ({
    title: typeof d?.title === "string" ? d.title : "",
    body: typeof d?.body === "string"
      ? d.body
      : (typeof d === "string" ? d : JSON.stringify(d?.body ?? "")),
  }));
  return { deliverables, malformed: false };
}

// The strict-JSON instruction injected into the specialist prompt so it
// returns N complete, platform-fitted deliverables instead of one blob.
export function buildDeliverableContract({ type, part = "body", count = 1, platform = "generic" } = {}) {
  const label = typeSpec(type)?.label || "deliverable";
  const ps = platformSpec(platform);
  const lenRule = ps.copyMaxChars
    ? `Keep each ${part} within ~${ps.copyMaxChars} characters.`
    : `Length as the format demands.`;
  const n = Math.max(1, Math.round(Number(count)) || 1);
  return [
    `Return STRICT JSON only — no preamble, no markdown fences:`,
    `{"deliverables":[{"title":"short label","body":"the ${part}"}]}`,
    `Produce exactly ${n} distinct, complete ${label} deliverable(s) for ${ps.label}.`,
    `Each must stand on its own and be ready to ship. Tone: ${ps.tone}. ${lenRule}`,
    `Do not number them in the body. Do not add any commentary outside the JSON.`,
  ].join(" ");
}

// Map a platform's image dimensions to the nearest fal named size.
// fal sizes: square_hd (1:1), landscape_4_3 (~3:2/4:3), landscape_16_9 (16:9+),
// portrait_4_3 (3:4), portrait_16_9 (9:16).
export function falSizeForPlatform(platform = "generic") {
  const { w, h } = platformSpec(platform).image;
  const ratio = (Number(w) || 1) / (Number(h) || 1);
  if (ratio >= 1.55) return "landscape_16_9";
  if (ratio >= 1.2)  return "landscape_4_3";
  if (ratio > 0.85)  return "square_hd";
  if (ratio > 0.6)   return "portrait_4_3";
  return "portrait_16_9";
}

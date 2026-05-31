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

function tryParse(s) {
  if (!s) return null;
  try { return JSON.parse(s); } catch { return null; }
}

// Slice the first JSON block out of surrounding prose (first { or [ to the
// matching last } or ]).
function extractJsonBlock(s) {
  if (!s) return null;
  const fObj = s.indexOf("{"), fArr = s.indexOf("[");
  let start = -1, close = "";
  if (fArr !== -1 && (fObj === -1 || fArr < fObj)) { start = fArr; close = "]"; }
  else if (fObj !== -1) { start = fObj; close = "}"; }
  if (start === -1) return null;
  const end = s.lastIndexOf(close);
  if (end <= start) return null;
  return s.slice(start, end + 1);
}

// Find a deliverables-like array from the shapes a model might emit:
// {deliverables:[...]}, a bare [...], or the first array-valued property.
function pickArray(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (!parsed || typeof parsed !== "object") return null;
  if (Array.isArray(parsed.deliverables)) return parsed.deliverables;
  for (const v of Object.values(parsed)) {
    if (Array.isArray(v) && v.length) return v;
  }
  return null;
}

// Last-resort cleaner: pull readable string values out of a JSON-ish blob so a
// card NEVER shows raw braces/keys. Guarantees the result has no { } [ ] chars.
function humanizeJsonish(s) {
  const vals = [];
  const re = /"(?:body|text|caption|content|copy|title|name|value)"\s*:\s*"((?:[^"\\]|\\.)*)"/gi;
  let m;
  while ((m = re.exec(s))) {
    try { vals.push(JSON.parse(`"${m[1]}"`)); } catch { vals.push(m[1]); }
  }
  const out = vals.length
    ? vals.join(" — ")
    : s.replace(/\w+\s*:\s*/g, "").replace(/[{}\[\]"]/g, "").replace(/\s*,\s*/g, " ").trim();
  return out.replace(/[{}\[\]]/g, "").trim();   // hard guarantee: no brackets
}

function coerceItem(d) {
  if (typeof d === "string") return { title: "", body: d };
  if (!d || typeof d !== "object") return { title: "", body: String(d ?? "") };
  const strBody = [d.body, d.text, d.caption, d.content, d.copy].find((x) => typeof x === "string" && x.trim());
  let body;
  if (typeof strBody === "string") body = strBody;
  else if ("body" in d) body = JSON.stringify(d.body ?? "");   // preserve non-string body value, not the whole element
  else body = humanizeJsonish(JSON.stringify(d));
  return {
    title: typeof d.title === "string" ? d.title : (typeof d.name === "string" ? d.name : ""),
    body,
  };
}

// Parse the specialist's structured output into deliverables. Always returns at
// least one item, and NEVER surfaces raw JSON — malformed JSON is humanized.
export function parseDeliverables(rawText) {
  const stripped = String(rawText || "")
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();

  const parsed = tryParse(stripped) ?? tryParse(extractJsonBlock(stripped));
  const arr = pickArray(parsed);
  if (arr && arr.length) {
    return { deliverables: arr.map(coerceItem), malformed: false };
  }

  const body = /^[\[{]/.test(stripped) ? humanizeJsonish(stripped) : stripped;
  return { deliverables: [{ title: "", body }], malformed: true };
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

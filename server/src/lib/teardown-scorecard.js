// ─────────────────────────────────────────────────────────────────────
// CAA-33 · Brand Intelligence Scorecard — a pure VIEW over a compiled BIO.
//
// The overall 0–100 is scoreBio() (already persisted on bios.score). This
// module adds the per-section breakdown + named gaps the gated report needs.
// It reads ONLY bios.payload — no schema change, nothing stored on the BIO.
//
// Each section score mirrors scoreBio's formula on that section's fields:
//   section = 100 * (0.6*coverage + 0.4*avgConf)
// (source-diversity is a whole-BIO signal, so it stays only in the overall.)
// ─────────────────────────────────────────────────────────────────────

import { scoreBio } from "./score-bio.js";

// Sections + the leaf fields that count toward each, matching score-bio.js.
const SECTIONS = [
  { key: "identity",  label: "Identity & positioning", fields: ["positioning", "category", "founded", "pillars"] },
  { key: "audience",  label: "Audience & jobs-to-be-done", fields: ["primary", "secondary", "tertiary", "jtbd"] },
  { key: "voice",     label: "Voice & tone", fields: ["register", "forbidden", "rhythm", "signatures"] },
  { key: "goals",     label: "Goals & priorities", fields: ["northStar", "q2", "q3"] },
  { key: "strategic", label: "Strategic tensions", fields: ["watchouts", "notList"] },
];

const nonEmpty = (v) => (Array.isArray(v) ? v.length > 0 : v != null && String(v).trim() !== "");

function bandFor(score) {
  if (score >= 75) return "strong";
  if (score >= 45) return "partial";
  return "thin";
}

function sectionScore(payload, section) {
  const conf = payload.confidence || {};
  const present = section.fields.filter((f) => nonEmpty(payload?.[section.key]?.[f]));
  const coverage = section.fields.length ? present.length / section.fields.length : 0;
  const confs = present.map((f) => {
    const c = conf[`${section.key}.${f}`]?.conf;
    return typeof c === "number" ? Math.min(100, Math.max(0, c)) / 100 : 0;
  });
  const avgConf = confs.length ? confs.reduce((a, b) => a + b, 0) / confs.length : 0;
  const score = Math.round(Math.max(0, Math.min(1, 0.6 * coverage + 0.4 * avgConf)) * 100);
  return {
    key: section.key,
    label: section.label,
    score,
    band: bandFor(score),
    covered: present.length,
    total: section.fields.length,
    missingFields: section.fields.filter((f) => !nonEmpty(payload?.[section.key]?.[f])),
  };
}

// Human-readable gaps: prefer the model's own `missing[]` reasons, fall back to
// "no <field>" for any scored field that is empty without a stated reason.
function collectGaps(payload, sections) {
  const gaps = [];
  const rawMissing = Array.isArray(payload.missing) ? payload.missing : [];
  const missingByField = new Map();
  for (const m of rawMissing) {
    const field = typeof m === "string" ? m : m?.field;
    const why = typeof m === "string" ? "" : m?.why || "";
    if (field) missingByField.set(field, why);
  }
  for (const s of sections) {
    for (const f of s.missingFields) {
      const dotted = `${s.key}.${f}`;
      gaps.push({ field: dotted, section: s.label, why: missingByField.get(dotted) || `No ${f} could be established from the public site.` });
    }
  }
  // Any missing[] entry outside the scored sections (e.g. visual.*) still counts.
  for (const [field, why] of missingByField) {
    if (!gaps.some((g) => g.field === field)) gaps.push({ field, section: field.split(".")[0], why: why || "Not established from the public site." });
  }
  return gaps;
}

/**
 * Build the scorecard view for the gated report.
 * @param {object} payload - a compiled BIO (bios.payload)
 * @returns {{ overall:number, band:string, headline:string, sections:Array, gaps:Array, sourceCount:number }}
 */
export function teardownScorecard(payload = {}) {
  const overall = scoreBio(payload);
  const sections = SECTIONS.map((s) => sectionScore(payload, s));
  const gaps = collectGaps(payload, sections);
  const conf = payload.confidence || {};
  const sourceCount = new Set(
    Object.values(conf).map((c) => (c?.source || "").trim().toLowerCase()).filter(Boolean),
  ).size;

  const weakest = [...sections].sort((a, b) => a.score - b.score)[0];
  const headline =
    overall >= 75
      ? "Your public brand reads clearly — the gaps below are where a Steward would sharpen it."
      : overall >= 45
        ? `Your brand is legible but uneven — ${weakest ? weakest.label.toLowerCase() : "several areas"} is where it leaks the most signal.`
        : "Your public brand under-communicates who you are — most of the intelligence a buyer needs isn't on the page yet.";

  return {
    overall,
    band: bandFor(overall),
    headline,
    sections,
    gaps,
    gapCount: gaps.length,
    sourceCount,
  };
}

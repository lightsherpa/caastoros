// server/src/lib/delivery-plan.js
// Pure helpers around a DeliveryPlan. No I/O. Validates a plan the Sharpener
// emitted against the taxonomy + platform registries, fills defaults, clamps
// to cost guardrails, derives a back-compat specialist list, and estimates
// credits when given a cr lookup.

import { typeSpec, isType } from "./taxonomy.js";
import { isPlatform, DEFAULT_PLATFORM } from "./platforms.js";

export const MAX_COUNT = 20;   // per-group hard cap (cost-at-scale guardrail)
export const MAX_GROUPS = 6;   // per-plan hard cap

function clampCount(n) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v) || v < 1) return 1;
  return Math.min(MAX_COUNT, v);
}

function normalizeGroup(raw) {
  if (!raw || !isType(raw.type) || raw.type === "legacy") {
    // Unknown/missing type can't be rendered downstream -> drop.
    // (legacy groups only come from wrapLegacy, never the Sharpener.)
    return null;
  }
  const spec = typeSpec(raw.type);
  const platforms = (Array.isArray(raw.platforms) ? raw.platforms : [])
    .filter(isPlatform);
  const crew = { ...spec.crew };
  if (raw.crew && typeof raw.crew === "object") {
    for (const part of spec.parts) {
      if (typeof raw.crew[part] === "string" && raw.crew[part]) crew[part] = raw.crew[part];
    }
  }
  return {
    type: raw.type,
    count: clampCount(raw.count),
    platforms: platforms.length ? platforms : [DEFAULT_PLATFORM],
    parts: [...spec.parts],
    crew,
    why: typeof raw.why === "string" ? raw.why.trim().slice(0, 360) : "",
    successSignal: typeof raw.successSignal === "string" ? raw.successSignal.trim().slice(0, 220) : "",
  };
}

export function normalizePlan(plan) {
  const groups = Array.isArray(plan?.deliverableGroups) ? plan.deliverableGroups : [];
  const deliverableGroups = groups
    .map(normalizeGroup)
    .filter(Boolean)
    .slice(0, MAX_GROUPS);

  const ids = new Set();
  for (const g of deliverableGroups) {
    for (const part of g.parts) ids.add(g.crew[part]);
  }
  return {
    deliverableGroups,
    proposedSpecialists: [...ids],
    orchestrationRationale: typeof plan?.orchestrationRationale === "string"
      ? plan.orchestrationRationale.trim().slice(0, 700)
      : "",
  };
}

export function wrapLegacy(specialistIds = []) {
  const deliverableGroups = (Array.isArray(specialistIds) ? specialistIds : [])
    .filter((id) => typeof id === "string" && id)
    .map((id) => ({
      type: "legacy",
      count: 1,
      platforms: [DEFAULT_PLATFORM],
      parts: ["output"],
      crew: { output: id },
    }));
  return { deliverableGroups, proposedSpecialists: [...new Set(deliverableGroups.map((g) => g.crew.output))], orchestrationRationale: "" };
}

// crOf: (agentId) => number of credits for that specialist. Returns null when
// no lookup is supplied (the client computes the user-facing estimate in the
// UX plan, where CI_AGENTS cr is available).
export function estimateCr(plan, crOf) {
  if (typeof crOf !== "function") return null;
  let total = 0;
  for (const g of plan?.deliverableGroups || []) {
    const perDeliverable = g.parts.reduce((s, part) => s + (Number(crOf(g.crew[part])) || 0), 0);
    total += g.count * g.platforms.length * perDeliverable;
  }
  return total;
}

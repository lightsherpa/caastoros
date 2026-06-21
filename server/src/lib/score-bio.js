// Deterministic BIO score — pure function of the compiled payload.
// score = 100 * (0.5*coverage + 0.35*avgConf + 0.15*sourceDiversity)
// coverage: fraction of scored leaf fields with a non-empty value.
// avgConf:  mean per-field confidence (from payload.confidence map), 0..1.
// sourceDiversity: distinct sources, saturating at 5.
// Confidence lives in payload.confidence["<section>.<key>"] = { conf, source }
// (sibling-map shape, per the plan). Values stay plain strings/arrays on payload.
const SCORED_PATHS = [
  ["identity","positioning"],["identity","category"],["identity","founded"],["identity","pillars"],
  ["audience","primary"],["audience","secondary"],["audience","tertiary"],["audience","jtbd"],
  ["voice","register"],["voice","forbidden"],["voice","rhythm"],["voice","signatures"],
  ["goals","northStar"],["goals","q2"],["goals","q3"],
  ["strategic","watchouts"],["strategic","notList"],
];
const nonEmpty = (v) => Array.isArray(v) ? v.length > 0 : (v != null && String(v).trim() !== "");

export function scoreBio(payload = {}) {
  const conf = payload.confidence || {};
  const present = SCORED_PATHS.filter(([s,k]) => nonEmpty(payload?.[s]?.[k]));
  if (SCORED_PATHS.length === 0) return 0;
  const coverage = present.length / SCORED_PATHS.length;
  const confs = present.map(([s,k]) => {
    const c = conf[`${s}.${k}`]?.conf;
    return typeof c === "number" ? Math.min(100, Math.max(0, c)) / 100 : 0;
  });
  const avgConf = confs.length ? confs.reduce((a,b)=>a+b,0)/confs.length : 0;
  const sources = new Set(
    present.map(([s,k]) => (conf[`${s}.${k}`]?.source || "").trim().toLowerCase()).filter(Boolean)
  );
  const sourceDiversity = Math.min(sources.size, 5) / 5;
  const raw = 0.5*coverage + 0.35*avgConf + 0.15*sourceDiversity;
  return Math.round(Math.max(0, Math.min(1, raw)) * 100);
}

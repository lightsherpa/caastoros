// Human-certification rubric engine — PURE. No DB, no network.
// The route loads the active rubric config from cert_rubric_versions and
// passes it in; this module only computes. Weights + thresholds are data,
// so they change without a deploy (edit the active config).
//
// Analytic rubric: each criterion scored 0–4 on behaviorally-anchored
// levels, weighted → 0–100 composite → decision band. GATING criteria have
// a hard floor: a high composite can never approve if a gate fails (a
// high-blast-radius field must clear an absolute bar, not be averaged away).
//
// Auto criteria (C1 coverage, C2 grounding) are derived from scoreBio's
// subterms; human criteria come from the reviewer's anchored scores.

export const DEFAULT_RUBRIC = {
  rubric_version: 1,
  selfCertMinScore: 58, // stage-1 self-cert precondition (used by the self-cert endpoint)
  criteria: [
    { id: "C1", label: "Coverage completeness",            weight: 0.15, source: "auto",  signal: "coverage",  gating: true,  floor: 2 },
    { id: "C2", label: "Evidence grounding",               weight: 0.15, source: "auto",  signal: "grounding", gating: false, floor: 0 },
    { id: "C3", label: "High-importance field integrity",  weight: 0.25, source: "human", gating: true,  floor: 3 },
    { id: "C4", label: "Positioning distinctiveness",      weight: 0.15, source: "human", gating: false, floor: 0 },
    { id: "C5", label: "Voice fidelity",                   weight: 0.10, source: "human", gating: false, floor: 0 },
    { id: "C6", label: "Internal consistency",             weight: 0.10, source: "human", gating: true,  floor: 2 },
    { id: "C7", label: "Strategic soundness",              weight: 0.10, source: "human", gating: false, floor: 0 },
  ],
  bands: { approve: 80, approve_with_conditions: 68, return_changes: 50 }, // reject < return_changes
};

// Map a 0..1 signal to a 0–4 anchored score.
function anchor01(v) {
  if (v >= 0.90) return 4;
  if (v >= 0.75) return 3;
  if (v >= 0.50) return 2;
  if (v >= 0.25) return 1;
  return 0;
}
function autoScore(signalKey, s = {}) {
  if (signalKey === "coverage") return anchor01(s.coverage ?? 0);
  if (signalKey === "grounding") return anchor01((s.avgConf ?? 0) * 0.7 + (s.sourceDiversity ?? 0) * 0.3);
  return 0;
}

/**
 * @param {object} args
 * @param {object} [args.autoSignals]    { coverage, avgConf, sourceDiversity } from scoreBioBreakdown
 * @param {object} [args.reviewerScores] { [criterionId]: { score: 0-4, confidence: 0-2 } } for human criteria
 * @param {object} [args.rubricConfig]   defaults to DEFAULT_RUBRIC
 * @returns {{ incomplete:boolean, missingScores?:string[], composite:number|null,
 *             band:string|null, gateFailures:object[], recommendedDecision:string|null,
 *             needsCalibration:boolean, breakdown:object[] }}
 */
export function evaluateCertification({ autoSignals = {}, reviewerScores = {}, rubricConfig = DEFAULT_RUBRIC } = {}) {
  const cfg = rubricConfig || DEFAULT_RUBRIC;
  const breakdown = [];
  const gateFailures = [];
  const missingScores = [];
  let composite01 = 0;
  let needsCalibration = false;

  for (const cr of cfg.criteria) {
    let score;
    let confidence = 2;
    if (cr.source === "auto") {
      score = autoScore(cr.signal, autoSignals);
    } else {
      const rs = reviewerScores[cr.id];
      if (!rs || typeof rs.score !== "number") { missingScores.push(cr.id); continue; }
      score = Math.max(0, Math.min(4, rs.score));
      confidence = typeof rs.confidence === "number" ? rs.confidence : 2;
    }
    const weighted = (score / 4) * cr.weight;
    composite01 += weighted;
    const gateFailed = !!cr.gating && score < cr.floor;
    if (gateFailed) gateFailures.push({ id: cr.id, label: cr.label, score, floor: cr.floor });
    // Low reviewer confidence on a gating criterion forces calibration.
    if (cr.gating && cr.source === "human" && confidence < 1) needsCalibration = true;
    breakdown.push({
      id: cr.id, label: cr.label, source: cr.source, score, confidence,
      weight: cr.weight, weighted: Math.round(weighted * 1000) / 1000,
      gating: !!cr.gating, gateFailed,
    });
  }

  if (missingScores.length) {
    return { incomplete: true, missingScores, composite: null, band: null, gateFailures, recommendedDecision: null, needsCalibration, breakdown };
  }

  const composite = Math.round(composite01 * 100);
  const b = cfg.bands;
  const band =
    composite >= b.approve ? "approve" :
    composite >= b.approve_with_conditions ? "approve_with_conditions" :
    composite >= b.return_changes ? "return_changes" : "reject";

  let recommendedDecision = band;
  if (gateFailures.length) {
    if (gateFailures.some((g) => g.score === 0)) recommendedDecision = "reject";
    else if (band === "approve" || band === "approve_with_conditions") recommendedDecision = "return_changes";
  }

  return { incomplete: false, composite, band, gateFailures, recommendedDecision, needsCalibration, breakdown };
}

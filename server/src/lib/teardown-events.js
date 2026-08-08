// ─────────────────────────────────────────────────────────────────────
// CAA-33 · Teardown funnel events + PQL scoring (contract for CAA-16, §3.1).
//
// Every meaningful step in the wedge appends one row to `teardown_events`.
// CAA-16 reads that table (pull) and/or mirrors these names into the
// @caastor/analytics taxonomy → PostHog. The names are the contract:
export const TEARDOWN_EVENTS = Object.freeze({
  STARTED:        "teardown_started",        // URL submitted
  BIO_READY:      "teardown_bio_ready",      // compile-bio finished, report renderable
  REPORT_VIEWED:  "teardown_report_viewed",  // gated report served
  EMAIL_CAPTURED: "teardown_email_captured", // the gate — email given
  PQL_CREATED:    "teardown_pql_created",    // PQL written for this lead
  BIO_DOWNLOADED: "teardown_bio_downloaded", // BIO JSON downloaded
  PILOT_CTA:      "teardown_pilot_cta_clicked",
});

/**
 * Append one funnel event. Never throws — a failed analytics write must not
 * break the user-facing flow (best-effort, logged).
 * @param {object} supabase - a service-role supabase client
 * @param {object} evt - { name, leadId?, brandId?, props? }
 */
export async function emitTeardownEvent(supabase, { name, leadId = null, brandId = null, props = {} }) {
  if (!name) return { ok: false, reason: "no name" };
  try {
    const { error } = await supabase.from("teardown_events").insert({
      lead_id: leadId,
      brand_id: brandId,
      name,
      props: props && typeof props === "object" ? props : {},
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  } catch (e) {
    console.warn(`[teardown-events] emit ${name} failed:`, e?.message || e);
    return { ok: false, reason: e?.message || String(e) };
  }
}

/**
 * PQL score — Product-Qualified-Lead heuristic, pure + testable.
 *
 *   pql = round(0.6 * engagement + 0.4 * clarity)
 *
 * engagement (0–100): how far down the funnel the lead got.
 * clarity    (0–100): the BIO's own score (a legible brand is a realer buyer
 *                     than a blank site that scraped to nothing).
 *
 * @param {object} args
 * @param {number} args.score           - bios.score (0–100)
 * @param {object} args.engagement      - { emailProvided, viewedReport, downloadedBio, clickedPilot }
 * @returns {{ pql:number, band:'cold'|'warm'|'hot', engagement:number }}
 */
export function computePql({ score = 0, engagement = {} } = {}) {
  const pts = [
    engagement.viewedReport ? 25 : 0,
    engagement.emailProvided ? 25 : 0,
    engagement.downloadedBio ? 20 : 0,
    engagement.clickedPilot ? 30 : 0,
  ];
  const engagementScore = Math.min(100, pts.reduce((a, b) => a + b, 0));
  const clarity = Math.max(0, Math.min(100, Number(score) || 0));
  const pql = Math.round(0.6 * engagementScore + 0.4 * clarity);
  const band = pql >= 70 ? "hot" : pql >= 40 ? "warm" : "cold";
  return { pql, band, engagement: engagementScore };
}

/* Pure derivations behind the home dashboard tiles. Extracted from
   portal-brandolph.jsx so the status/cycle rules are testable — they decide
   what the operator reads as "shipped" and how much credit is left, and both
   fail silently if wrong. */

/* A brief is shipped when it produced outputs and the user approved all of
   them; in flight when it has work that hasn't been approved yet. Briefs with
   no runs at all are neither — they're drafts that never fired. */
export function briefProgress(brief) {
  const runs = brief?.runs || [];
  const outputs = runs.flatMap((r) => r.outputs || []);
  if (runs.some((r) => r.status === "queued" || r.status === "running")) return "in-flight";
  if (outputs.length === 0) return "draft";
  return outputs.every((o) => o.status === "approved") ? "shipped" : "in-flight";
}

/* Days remaining in the credit cycle. loadCreditState windows the monthly
   pool by calendar month, so the cycle ends when the month does. */
export function daysLeftInCycle(now = new Date()) {
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return Math.max(0, Math.ceil((end - now) / 86400000));
}

/* Success rate counts only briefs that actually ran — never-fired drafts
   would otherwise drag the number down for work nobody asked for. */
export function successRate({ shipped, inFlight }) {
  const ran = shipped + inFlight;
  return ran > 0 ? Math.round((shipped / ran) * 100) : 0;
}

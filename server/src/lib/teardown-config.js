// ─────────────────────────────────────────────────────────────────────
// CAA-33 · Teardown offer copy — PLUGGABLE config.
//
// Pilot-offer terms + report copy are CMO/CEO-gated (do not surface
// auto-creative claims in 0a). Ellis/Brandolph own the words; this file is the
// single seam they change. Env override lets Growth A/B a variant without a
// deploy: TEARDOWN_OFFER_KEY selects a variant below.
// ─────────────────────────────────────────────────────────────────────

const OFFERS = {
  default: {
    key: "default",
    // Report framing (shown above the scorecard).
    reportKicker: "BIO Teardown",
    reportTitle: (brand) => `${brand} — Brand Intelligence Teardown`,
    // Email gate.
    gateHeading: "See your full Brand Intelligence Object",
    gateSub: "Your scorecard is above. Enter your email to unlock the full BIO — positioning, audience, voice, strategic tensions — and download it.",
    gateCta: "Unlock the full BIO",
    // Pilot CTA (post-gate). NO auto-creative claims in 0a.
    pilotHeading: "Want a human to sharpen this?",
    pilotBody: "A Caastor Steward can turn this BIO into a certified brand foundation and run your first briefs against it.",
    pilotCtaLabel: "Book a founding-customer pilot",
    // Where the CTA points. Set TEARDOWN_PILOT_URL in env for the real link.
    pilotCtaUrl: process.env.TEARDOWN_PILOT_URL || "mailto:hello@caastor.com?subject=Caastor%20pilot",
  },
};

export function getOffer(key) {
  const chosen = key || process.env.TEARDOWN_OFFER_KEY || "default";
  return OFFERS[chosen] || OFFERS.default;
}

/* Seed brand + BIO for P0 — mirrors the SPA's CI_DISCOVERY/CI_BRAND_REFUSALS.
   Replace with a real DB read in P1 (Discovery → BIO live). */

export const VINILO_BRAND = {
  id: "vinilo",
  name: "Vinilo Coffee",
  url: "vinilo.coffee",
  tagline: "Specialty coffee for slow Tuesdays.",
};

export const VINILO_BIO = {
  version: 1,
  score: 91,

  identity: {
    name: "Vinilo Coffee",
    positioning: "Specialty coffee for slow Tuesdays.",
    category: "Specialty coffee · subscription + café",
    founded: "2021 · Barcelona",
    ownership: "Founder-led · 2 co-founders · 8 FTEs",
    pillars: ["Provenance", "Routine", "Patience", "Café-as-rest"],
  },

  audience: {
    primary: "Subscribers, 28–48, urban, recurring purchase behaviour. Value routine over discovery.",
    secondary: "Café-warm locals. Walks-in within 2.5km. Tuesday afternoon over Saturday morning.",
    tertiary: "Wholesale buyers. Specialty hotels + co-working spaces.",
    jtbd: [
      "The decision to slow down",
      "The ritual that holds the week together",
      "A weekly bag arriving on time",
    ],
  },

  voice: {
    register: "Editorial, low-urgency, second person. Funny only when it's earned.",
    forbidden: ["unlock", "limited time", "FOMO", "drop", "exclusive", "kit", "journey"],
    rhythm: "Short. Then longer, with a slight ramp. Periods over commas. No dashes-for-pace.",
    signatures: [
      "The phrase 'on purpose'",
      "'It isn't X — it's Y'",
      "First-person plural only in brand voice",
    ],
  },

  visual: {
    palette: [
      { hex: "#1F1A14", name: "Espresso" },
      { hex: "#C97B3F", name: "Ember" },
      { hex: "#F4ECDD", name: "Cream" },
      { hex: "#7FA37A", name: "Sage" },
      { hex: "#E8A020", name: "Honey" },
    ],
    type: [
      { kind: "Display", family: "Söhne Breit" },
      { kind: "Body", family: "GT Sectra Display" },
    ],
    imagery: ["Hands + craft tools", "Café interiors low light", "Producer portraits", "Coffee bag detail (no model)"],
    avoid: ["B&W documentary", "Latte art top-down", "Group lifestyle shots"],
  },

  goals: {
    northStar: "Be the coffee that earns the Tuesday back, for 10,000 households.",
    q2: "Pricing relaunch + summer Tuesdays campaign.",
    q3: "Honduras + Aug microlot. Brand book v2.",
  },

  strategic: {
    watchouts: [
      "The 'slow Tuesday' line is doing a lot of work. If you outgrow it without retiring it cleanly, the brand reads contradictory.",
      "The café revenue is half the business. The site reads like it's only the subscription. There's a tension to resolve, not hide.",
      "Wholesale audience is on the BIO but invisible everywhere else. Decide if it stays.",
    ],
    notList: [
      "A discount-led subscription.",
      "A 'drop' culture roaster.",
      "An aesthetic-led brand. The taste is the brand.",
      "A coffee-cult evangelism brand. Quiet conviction over loud taste.",
    ],
  },
};

/* Brand-global refusals — every L1/L2 call inherits these. */
export const VINILO_REFUSALS = [
  "Never use the words 'unlock', 'limited', or 'exclusive' — they cheapen the brand.",
  "Respect the 11.4× annual pricing formula; never invent a discount.",
  "Reference provenance (origin, grower) only where the BIO marks it mandatory — once, never as decoration.",
  "Refuse anything that contradicts the BIO; flag the conflict instead of complying.",
  "Keep voice-drift ≤ 0.20 against the brand voice — no hype, no manufactured urgency.",
];

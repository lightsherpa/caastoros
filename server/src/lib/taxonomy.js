// server/src/lib/taxonomy.js
// Deliverable-type registry. One entry = one shippable artifact shape.
// `parts` are the components of a single deliverable; `crew` maps each part
// to the specialist that produces it; `platformSensitive` lists the parts
// whose spec changes per platform (§4.3a of the design). All crew ids must
// exist in CI_AGENTS / CI_SPECIALIST_SPECS.

export const DELIVERABLE_TYPES = {
  social_post:     { label: "Social post",     parts: ["caption", "image"],                 crew: { caption: "a16", image: "a41" },                      platformSensitive: ["caption", "image"], visual: true },
  carousel:        { label: "Carousel",        parts: ["caption", "frames"],                crew: { caption: "a16", frames: "a41" },                     platformSensitive: ["caption", "frames"], visual: true },
  ad_creative:     { label: "Ad creative",     parts: ["headline", "body", "image"],        crew: { headline: "a37", body: "a12", image: "a42" },        platformSensitive: ["headline", "body", "image"], visual: true },
  blog_article:    { label: "Blog article",    parts: ["body", "hero_image"],               crew: { body: "a15", hero_image: "a21" },                    platformSensitive: ["hero_image"], visual: true },
  deck:            { label: "Deck",            parts: ["outline", "slides"],                crew: { outline: "a36", slides: "a44" },                     platformSensitive: ["slides"], visual: true },
  key_visual:      { label: "Key visual",      parts: ["image", "concept"],                 crew: { image: "a20", concept: "a08" },                      platformSensitive: ["image"], visual: true },
  email:           { label: "Email",           parts: ["subject", "body"],                  crew: { subject: "a14", body: "a13" },                       platformSensitive: ["body"], visual: false },
  email_sequence:  { label: "Email sequence",  parts: ["subject", "body"],                  crew: { subject: "a14", body: "a13" },                       platformSensitive: ["body"], visual: false },
  newsletter:      { label: "Newsletter",      parts: ["subject", "body", "hero_image"],    crew: { subject: "a14", body: "a13", hero_image: "a21" },     platformSensitive: ["hero_image"], visual: true },
  case_study:      { label: "Case study",      parts: ["narrative", "pull_quotes", "hero_image"], crew: { narrative: "a15", pull_quotes: "a09", hero_image: "a21" }, platformSensitive: ["hero_image"], visual: true },
  landing_section: { label: "Landing section", parts: ["heading", "body"],                  crew: { heading: "a12", body: "a17" },                       platformSensitive: ["body"], visual: false },
  naming:          { label: "Naming",          parts: ["name", "rationale"],                crew: { name: "a07", rationale: "a07" },                     platformSensitive: [], visual: false },
  tagline:         { label: "Tagline",         parts: ["line"],                             crew: { line: "a09" },                                       platformSensitive: [], visual: false },
  mood_frame:      { label: "Mood frame",      parts: ["image"],                            crew: { image: "a35" },                                      platformSensitive: ["image"], visual: true },
  hero_kv:         { label: "Hero KV",         parts: ["image"],                            crew: { image: "a20" },                                      platformSensitive: ["image"], visual: true },
  infographic:     { label: "Infographic",     parts: ["spec", "image"],                    crew: { spec: "a45", image: "a45" },                         platformSensitive: ["image"], visual: true },
  // back-compat: a single specialist output with no deliverable structure.
  legacy:          { label: "Output",          parts: ["output"],                           crew: { output: "a01" },                                     platformSensitive: [], visual: false },
};

export const DEFAULT_TYPE = "social_post";

export function isType(id) {
  return Object.prototype.hasOwnProperty.call(DELIVERABLE_TYPES, id);
}

// Returns null (not a fallback) for unknown ids — intentionally asymmetric
// with platformSpec(). A bad platform degrades to "generic" because the
// deliverable is still shippable, but an unknown deliverable TYPE must be
// dropped by callers (see delivery-plan normalizePlan), never silently
// coerced into a default type — that would fabricate deliverables the user
// never asked for.
export function typeSpec(id) {
  return DELIVERABLE_TYPES[id] || null;
}

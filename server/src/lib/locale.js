// Locale foundation — pure helpers. No DB, no network.
//
// Spec §4: language-of-brief and language-of-output are SEPARATE. A brand
// briefed in Spanish must be able to produce Arabic output. These helpers
// encode that separation so callers (briefs/runs, later) resolve OUTPUT
// locales from the run/brief/brand chain — never from the brief's language.
//
// Supported locales: en, es, ar. Arabic is RTL. A brand's numeral system
// (Latin vs Arabic-Indic digits) is tracked independently of its language.

export const SUPPORTED_LOCALES = ["en", "es", "ar"];
export const DEFAULT_LOCALE = "en";

// Right-to-left locales — drives text direction for rendered output.
export const RTL_LOCALES = new Set(["ar"]);

// Numeral systems: 'latn' = 0-9, 'arab' = ٠-٩.
export const NUMERAL_SYSTEMS = ["latn", "arab"];
export const DEFAULT_NUMERAL_SYSTEM = "latn";

/** True iff `loc` renders right-to-left. */
export function isRtl(loc) {
  return RTL_LOCALES.has(normalizeLocale(loc));
}

/** Coerce any input to a supported locale, falling back to DEFAULT_LOCALE. */
export function normalizeLocale(loc) {
  return SUPPORTED_LOCALES.includes(loc) ? loc : DEFAULT_LOCALE;
}

/** Dedup + normalize a list of locales into supported, ordered, unique locales. */
function cleanLocales(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const raw of list) {
    if (!SUPPORTED_LOCALES.includes(raw)) continue; // drop junk rather than coercing to DEFAULT
    if (!out.includes(raw)) out.push(raw);
  }
  return out;
}

/**
 * Resolve the TARGET output locales for a run or brief.
 *
 * Precedence: explicit `requested` (if it yields any supported locale),
 * else the brand's `output_locales`, else a single-element list built from
 * the brand's `default_locale` (or DEFAULT_LOCALE). Result is always a
 * non-empty array of supported, deduped locales.
 *
 * This is where the brief-vs-output separation lives: a caller passes the
 * OUTPUT targets here, never the brief's language.
 *
 * @param {object} args
 * @param {string[]} [args.requested]  explicit output targets
 * @param {object}   [args.brand]      { output_locales?, default_locale? }
 * @returns {string[]} non-empty list of supported locales
 */
export function resolveOutputLocales({ requested, brand } = {}) {
  const fromRequested = cleanLocales(requested);
  if (fromRequested.length) return fromRequested;

  const fromBrand = cleanLocales(brand?.output_locales);
  if (fromBrand.length) return fromBrand;

  return [normalizeLocale(brand?.default_locale)];
}

/**
 * Resolve a brand's numeral system, defaulting to 'latn'.
 * @param {object} [brand]  { numeral_system? }
 * @returns {'latn'|'arab'}
 */
export function resolveNumeralSystem(brand) {
  const ns = brand?.numeral_system;
  return NUMERAL_SYSTEMS.includes(ns) ? ns : DEFAULT_NUMERAL_SYSTEM;
}

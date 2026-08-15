// ─────────────────────────────────────────────────────────────────────
// CaastorOS — lean, dependency-free i18n layer (EN / ES / AR).
//
// Design goals:
//   • No heavy i18n library. Message catalogs are plain JSON; lookup +
//     interpolation + ICU-lite plurals are ~80 lines below.
//   • `en` is the source of truth for keys and the fallback catalog.
//   • Plurals go through Intl.PluralRules(locale) — never a ternary —
//     because Arabic has 6 CLDR plural categories (zero/one/two/few/
//     many/other).
//   • Numbers/dates go through Intl.{Number,DateTime}Format keyed to the
//     active locale, so Arabic renders Arabic-Indic numerals for free.
//   • React integration is a single `useLocale()` hook backed by
//     useSyncExternalStore — any component that calls it re-renders when
//     the locale changes. No provider needed.
//
// Locale values (the translations) live in ../locales/{en,es,ar}.json.
// Everything here — keys, comments, identifiers — stays in English.
// ─────────────────────────────────────────────────────────────────────

import { useSyncExternalStore } from "react";

import en from "../locales/en.json";
import es from "../locales/es.json";
import ar from "../locales/ar.json";

const CATALOGS = { en, es, ar };
const FALLBACK = "en";
const RTL_LOCALES = new Set(["ar"]);

// The locale picker's source of truth: order + display labels.
// `short` is what the compact switcher shows; `native` is the endonym.
export const LOCALES = [
  { code: "en", short: "EN", native: "English" },
  { code: "es", short: "ES", native: "Español" },
  { code: "ar", short: "العربية", native: "العربية" },
];

const SUPPORTED = LOCALES.map((l) => l.code);

// ── locale state (module-level external store) ──────────────────────
const STORAGE_KEY = "locale";
const listeners = new Set();

function detectInitialLocale() {
  // 1) explicit prior choice, 2) browser language, 3) fallback.
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && SUPPORTED.includes(stored)) return stored;
  } catch (e) { /* localStorage blocked (private mode) — fall through */ }
  try {
    const nav = (navigator.language || "").slice(0, 2).toLowerCase();
    if (SUPPORTED.includes(nav)) return nav;
  } catch (e) { /* no navigator — fall through */ }
  return FALLBACK;
}

let currentLocale = detectInitialLocale();

export function getLocale() {
  return currentLocale;
}

export function isRTL(loc = currentLocale) {
  return RTL_LOCALES.has(loc);
}

export function getDir(loc = currentLocale) {
  return isRTL(loc) ? "rtl" : "ltr";
}

// Reflect the active locale onto <html> so CSS (and the browser) key off
// lang/dir. Idempotent — safe to call at boot and on every change.
function applyDocumentLocale(loc) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.lang = loc;
  root.dir = getDir(loc);
}

/**
 * Switch the active locale. Persists the choice, updates <html lang/dir>,
 * and notifies every subscribed component so they re-render.
 */
export function setLocale(loc) {
  if (!SUPPORTED.includes(loc)) loc = FALLBACK;
  if (loc === currentLocale) return;
  currentLocale = loc;
  try { localStorage.setItem(STORAGE_KEY, loc); } catch (e) { /* ignore */ }
  applyDocumentLocale(loc);
  for (const fn of listeners) fn();
}

/**
 * Boot hook — call once from main.jsx before render so <html lang/dir>
 * are correct on first paint. Returns the resolved locale.
 */
export function initI18n() {
  applyDocumentLocale(currentLocale);
  return currentLocale;
}

// Apply once at module-eval time too, so lang/dir are right even if a
// caller forgets initI18n() (defensive; both paths are idempotent).
applyDocumentLocale(currentLocale);

// ── message lookup + formatting ─────────────────────────────────────

// Walk a dotted key ("nav.create") through a nested catalog object.
function lookup(catalog, key) {
  let node = catalog;
  for (const part of key.split(".")) {
    if (node == null || typeof node !== "object") return undefined;
    node = node[part];
  }
  return node;
}

// Replace {name} placeholders with vars[name]; unknown names pass through.
function interpolate(str, vars) {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (m, name) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : m
  );
}

// Render a catalog value. Two shapes:
//   • string            → interpolate {vars}
//   • { plural: {...} }  → select a CLDR category via Intl.PluralRules
//                          against vars.count, then interpolate.
function render(value, vars, loc) {
  if (value && typeof value === "object" && value.plural) {
    const count = vars && typeof vars.count === "number" ? vars.count : 0;
    let category = "other";
    try { category = new Intl.PluralRules(loc).select(count); }
    catch (e) { /* unknown locale → keep 'other' */ }
    const forms = value.plural;
    const chosen = forms[category] != null ? forms[category] : forms.other;
    return interpolate(chosen == null ? "" : chosen, { count, ...vars });
  }
  if (typeof value === "string") return interpolate(value, vars);
  return value == null ? "" : String(value);
}

/**
 * Translate a dotted key in the active catalog.
 * Fallback chain: active locale → `en` → the key itself.
 *
 * @param {string} key   e.g. "nav.create" or "plans.allowance"
 * @param {object} [vars] interpolation vars; `count` also drives plurals
 */
export function t(key, vars) {
  const active = CATALOGS[currentLocale] || CATALOGS[FALLBACK];
  let value = lookup(active, key);
  if (value === undefined && currentLocale !== FALLBACK) {
    value = lookup(CATALOGS[FALLBACK], key);
  }
  if (value === undefined) return key; // last-resort: surface the key
  return render(value, vars, currentLocale);
}

// ── Intl number / date helpers, keyed to the active locale ──────────

export function fmtNumber(n, options) {
  try { return new Intl.NumberFormat(currentLocale, options).format(n); }
  catch (e) { return String(n); }
}

export function fmtDate(d, options) {
  const date = d instanceof Date ? d : new Date(d);
  try { return new Intl.DateTimeFormat(currentLocale, options).format(date); }
  catch (e) { return String(d); }
}

// ── React integration ───────────────────────────────────────────────

function subscribe(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/**
 * Subscribe a component to locale changes.
 * Returns { locale, setLocale, t } — call t() during render and the
 * component re-translates whenever setLocale() fires anywhere.
 */
export function useLocale() {
  const locale = useSyncExternalStore(subscribe, getLocale, () => FALLBACK);
  return { locale, setLocale, t };
}

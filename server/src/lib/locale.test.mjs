import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
  isRtl,
  normalizeLocale,
  resolveOutputLocales,
  resolveNumeralSystem,
} from "./locale.js";

test("supported set is exactly en/es/ar", () => {
  assert.deepEqual(SUPPORTED_LOCALES, ["en", "es", "ar"]);
  assert.equal(DEFAULT_LOCALE, "en");
});

test("normalizeLocale rejects junk, passes supported", () => {
  assert.equal(normalizeLocale("es"), "es");
  assert.equal(normalizeLocale("fr"), "en"); // unsupported -> default
  assert.equal(normalizeLocale(""), "en");
  assert.equal(normalizeLocale(undefined), "en");
  assert.equal(normalizeLocale(null), "en");
});

test("isRtl is true only for Arabic", () => {
  assert.equal(isRtl("ar"), true);
  assert.equal(isRtl("en"), false);
  assert.equal(isRtl("es"), false);
  assert.equal(isRtl("junk"), false); // normalizes to en
});

test("brief language != output language is allowed", () => {
  // Brief written in Spanish, output requested in Arabic — core §4 separation.
  const brief = { brief_lang: "es" };
  const targets = resolveOutputLocales({ requested: ["ar"], brand: { default_locale: "es" } });
  assert.deepEqual(targets, ["ar"]);
  assert.notEqual(brief.brief_lang, targets[0]);
});

test("resolveOutputLocales precedence + dedup + junk-drop", () => {
  // requested wins, deduped, junk dropped
  assert.deepEqual(
    resolveOutputLocales({ requested: ["ar", "ar", "fr", "en"], brand: { output_locales: ["es"] } }),
    ["ar", "en"],
  );
  // empty/all-junk requested -> brand.output_locales
  assert.deepEqual(
    resolveOutputLocales({ requested: ["fr", "de"], brand: { output_locales: ["es", "en"] } }),
    ["es", "en"],
  );
  // no requested -> brand.output_locales
  assert.deepEqual(
    resolveOutputLocales({ brand: { output_locales: ["ar"] } }),
    ["ar"],
  );
  // nothing usable -> [default_locale]
  assert.deepEqual(
    resolveOutputLocales({ brand: { default_locale: "es" } }),
    ["es"],
  );
  // truly empty -> [DEFAULT_LOCALE]
  assert.deepEqual(resolveOutputLocales({}), ["en"]);
  assert.deepEqual(resolveOutputLocales(), ["en"]);
});

test("resolveNumeralSystem defaults to latn", () => {
  assert.equal(resolveNumeralSystem({ numeral_system: "arab" }), "arab");
  assert.equal(resolveNumeralSystem({ numeral_system: "latn" }), "latn");
  assert.equal(resolveNumeralSystem({ numeral_system: "bogus" }), "latn");
  assert.equal(resolveNumeralSystem({}), "latn");
  assert.equal(resolveNumeralSystem(undefined), "latn");
});

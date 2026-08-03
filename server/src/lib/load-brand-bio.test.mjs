// Pure-logic checks for the BIO loader gate. No Supabase needed — supabase.js
// is import-safe (placeholder client) so importing the module doesn't hit a DB.
import { test } from "node:test";
import assert from "node:assert/strict";
import { bioGateCode, resolveRefusals } from "./load-brand-bio.js";

test("bioGateCode: no BIO row → BIO_NOT_READY (lenient) / BIO_NOT_CERTIFIED (strict) — never a fallback", () => {
  assert.equal(bioGateCode(null, false), "BIO_NOT_READY");
  assert.equal(bioGateCode(null, true), "BIO_NOT_CERTIFIED");
});

test("bioGateCode: a BIO row present → null (proceed), regardless of cert requirement", () => {
  const row = { id: "b1", certified: false };
  assert.equal(bioGateCode(row, false), null);
  assert.equal(bioGateCode(row, true), null); // strict query already filtered to certified rows
});

test("resolveRefusals: empty/missing → [] (never a seed brand's café refusals)", () => {
  assert.deepEqual(resolveRefusals(null), []);
  assert.deepEqual(resolveRefusals(undefined), []);
  assert.deepEqual(resolveRefusals([]), []);
});

test("resolveRefusals: the brand's own refusals pass through unchanged", () => {
  const own = ["Never claim clinical results.", "Do not use scarcity language."];
  assert.deepEqual(resolveRefusals(own), own);
});

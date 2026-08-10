import test from "node:test";
import assert from "node:assert/strict";

import { requireBrandId, resolveRunBrandId } from "./brand-scope.js";

test("new brand-owned work requires an explicit brand id", () => {
  assert.throws(() => requireBrandId(null), { code: "BRAND_REQUIRED" });
  assert.throws(() => requireBrandId("  "), { code: "BRAND_REQUIRED" });
  assert.equal(requireBrandId("  brand-2  "), "brand-2");
});

test("an existing brief pins subsequent runs to its own brand", () => {
  assert.equal(resolveRunBrandId({ existingBriefBrandId:"brand-2" }), "brand-2");
  assert.equal(resolveRunBrandId({ brandId:"brand-2", existingBriefBrandId:"brand-2" }), "brand-2");
  assert.throws(
    () => resolveRunBrandId({ brandId:"brand-1", existingBriefBrandId:"brand-2" }),
    { code:"BRAND_MISMATCH" },
  );
});

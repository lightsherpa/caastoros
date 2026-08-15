import test from "node:test";
import assert from "node:assert/strict";

import { applyBioVerification, buildVerificationClaims, normalizeBioEvidence } from "./bio-evidence.js";

test("normalizeBioEvidence marks empty high-impact fields as missing", () => {
  const payload = normalizeBioEvidence({
    identity: { positioning: "" },
    audience: { primary: "Busy founders" },
    confidence: { "audience.primary": { conf: 60, source: "homepage" } },
  });

  assert.equal(payload.fieldStatus["identity.positioning"], "missing");
  assert.equal(payload.fieldStatus["audience.primary"], "inferred");
  assert.ok(payload.missing.some((item) => item.field === "identity.positioning"));
});

test("applyBioVerification clears unsupported high-impact claims", () => {
  const payload = applyBioVerification({
    identity: { positioning: "The cheapest agency in Europe" },
    confidence: { "identity.positioning": { conf: 80, source: "homepage" } },
  }, {
    verdicts: [{
      field: "identity.positioning",
      status: "unsupported",
      confidence: 20,
      reason: "No pricing claim appears in the source material.",
    }],
  });

  assert.equal(payload.identity.positioning, null);
  assert.equal(payload.fieldStatus["identity.positioning"], "unsupported");
  assert.equal(payload.confidence["identity.positioning"].conf, 20);
  assert.ok(payload.missing.some((item) => item.field === "identity.positioning"));
});

test("buildVerificationClaims only includes populated high-impact fields", () => {
  const claims = buildVerificationClaims({
    identity: { positioning: "A membership coffee brand", category: "" },
    audience: { primary: "Urban subscribers" },
  });

  assert.deepEqual(claims.map((claim) => claim.field), ["identity.positioning", "audience.primary"]);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { prepareTotpFactor } from "./mfa.js";

test("uses an existing verified TOTP factor without enrolling another", async () => {
  let enrollCalls = 0;
  const verified = { id:"verified", status:"verified", friendly_name:"CaastorOS" };
  const result = await prepareTotpFactor({
    listFactors: async () => ({ data:{ totp:[verified] }, error:null }),
    enroll: async () => { enrollCalls += 1; },
  });
  assert.equal(result.factor, verified);
  assert.equal(result.enrolling, false);
  assert.equal(enrollCalls, 0);
});

test("removes an abandoned enrollment before generating a fresh QR factor", async () => {
  const removed = [];
  const result = await prepareTotpFactor({
    listFactors: async () => ({ data:{ totp:[{ id:"stale", status:"unverified", friendly_name:"CaastorOS" }] }, error:null }),
    unenroll: async ({ factorId }) => { removed.push(factorId); return { error:null }; },
    enroll: async () => ({ data:{ id:"fresh", totp:{ qr_code:"data:image/svg+xml,fresh", secret:"secret" } }, error:null }),
  });
  assert.deepEqual(removed, ["stale"]);
  assert.equal(result.factor.id, "fresh");
  assert.equal(result.enrolling, true);
});

test("finds abandoned TOTP factors exposed only through the aggregate list", async () => {
  const removed = [];
  await prepareTotpFactor({
    listFactors: async () => ({ data:{ all:[{ id:"aggregate-stale", factor_type:"totp", status:"unverified", friendly_name:"CaastorOS" }], totp:[] }, error:null }),
    unenroll: async ({ factorId }) => { removed.push(factorId); return { error:null }; },
    enroll: async () => ({ data:{ id:"fresh" }, error:null }),
  });
  assert.deepEqual(removed, ["aggregate-stale"]);
});

test("admin account pages do not impose a page-wide MFA checkpoint", async () => {
  const shell = await readFile(new URL("../portal-shell.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(shell, /isMfaStepUpRoute/);
  assert.doesNotMatch(shell, /<MfaGate/);
  assert.match(shell, /portal === "super_admin"\) && !isAdminRoute && !isClientRoute/);
});

test("OPEX reads are role-gated without MFA while sensitive operations retain step-up", async () => {
  const opex = await readFile(new URL("../../server/src/routes/opex.js", import.meta.url), "utf8");
  assert.match(opex, /app\.use\("\*", requirePermission\("opex\.read"\)\)/);
  assert.match(opex, /requirePermission\("opex\.budgets\.manage", \{ mfa: true \}\)/);
  assert.match(opex, /requirePermission\("opex\.override", \{ mfa: true \}\)/);
  assert.match(opex, /requirePermission\("opex\.export", \{ mfa: true \}\)/);
});

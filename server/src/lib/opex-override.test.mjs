import test from "node:test";
import assert from "node:assert/strict";
import { createOpexOverride, verifyOpexOverride } from "./opex-override.js";

const originalSecret = process.env.OPEX_OVERRIDE_SECRET;
process.env.OPEX_OVERRIDE_SECRET = "test-secret-that-is-not-used-in-production";
test.after(() => {
  if (originalSecret == null) delete process.env.OPEX_OVERRIDE_SECRET;
  else process.env.OPEX_OVERRIDE_SECRET = originalSecret;
});

test("override tokens are bound to the issuing user and operation", () => {
  const issued = createOpexOverride({ userId: "super-admin-1", operationKey: "specialist.text", reason: "Emergency delivery approved" });
  assert.equal(verifyOpexOverride(issued.token, { userId: "super-admin-1", operationKey: "specialist.text" })?.reason, "Emergency delivery approved");
  assert.equal(verifyOpexOverride(issued.token, { userId: "another-user", operationKey: "specialist.text" }), null);
  assert.equal(verifyOpexOverride(issued.token, { userId: "super-admin-1", operationKey: "specialist.image" }), null);
});

test("tampered and expired override tokens fail closed", () => {
  const realNow = Date.now;
  let now = 1_800_000_000_000;
  Date.now = () => now;
  try {
    const issued = createOpexOverride({ userId: "super-admin-1", operationKey: "brandolph.ask", reason: "Approved incident response", ttlMinutes: 1 });
    assert.equal(verifyOpexOverride(`${issued.token}x`, { userId: "super-admin-1", operationKey: "brandolph.ask" }), null);
    now += 60_001;
    assert.equal(verifyOpexOverride(issued.token, { userId: "super-admin-1", operationKey: "brandolph.ask" }), null);
  } finally {
    Date.now = realNow;
  }
});

test("issuance rejects unsupported scopes and vague reasons", () => {
  assert.throws(() => createOpexOverride({ userId: "u1", operationKey: "unknown", reason: "A valid reason" }), /Invalid OPEX override scope/);
  assert.throws(() => createOpexOverride({ userId: "u1", operationKey: "brief.sharpen", reason: "urgent" }), /specific override reason/);
});

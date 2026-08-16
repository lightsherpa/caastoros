import crypto from "node:crypto";

export const OPEX_OVERRIDE_OPERATIONS = new Set([
  "specialist.text",
  "specialist.image",
  "discovery.compile",
  "brandolph.ask",
  "brief.sharpen",
]);

const secret = () => {
  const value = process.env.OPEX_OVERRIDE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (value) return value;
  if (process.env.NODE_ENV === "production") throw new Error("OPEX override signing secret is not configured");
  return "development-only-override-secret";
};
const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");

export function createOpexOverride({ userId, operationKey, reason, ttlMinutes = 15 }) {
  if (!userId || !OPEX_OVERRIDE_OPERATIONS.has(operationKey)) throw new Error("Invalid OPEX override scope");
  const cleanReason = String(reason || "").trim();
  if (cleanReason.length < 8) throw new Error("A specific override reason is required");
  const issuedAt = Date.now();
  const payload = {
    version: 1,
    nonce: crypto.randomUUID(),
    userId,
    operationKey,
    reason: cleanReason,
    issuedAt,
    expiresAt: issuedAt + Math.min(60, Math.max(1, Number(ttlMinutes) || 15)) * 60_000,
  };
  const body = encode(payload);
  const signature = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
  return { token: `${body}.${signature}`, ...payload };
}

export function verifyOpexOverride(token, { userId, operationKey }) {
  try {
    const [body, signature] = String(token || "").split(".");
    if (!body || !signature || !OPEX_OVERRIDE_OPERATIONS.has(operationKey)) return null;
    const expected = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
    const suppliedBytes = Buffer.from(signature);
    const expectedBytes = Buffer.from(expected);
    if (suppliedBytes.length !== expectedBytes.length || !crypto.timingSafeEqual(suppliedBytes, expectedBytes)) return null;
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    const now = Date.now();
    if (payload.version !== 1 || !payload.nonce || payload.userId !== userId || payload.operationKey !== operationKey) return null;
    if (!Number.isFinite(payload.issuedAt) || !Number.isFinite(payload.expiresAt)) return null;
    if (payload.issuedAt > now + 30_000 || payload.expiresAt <= now || payload.expiresAt - payload.issuedAt > 60 * 60_000) return null;
    return payload;
  } catch { return null; }
}

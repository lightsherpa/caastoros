// Stable content hash of a BIO payload. Binds a self-cert attestation or a
// certification decision to the EXACT payload it was made against — any later
// edit changes the hash, so the attestation/decision no longer matches (the
// self-cert auto-lapses; the audit record stays honest). Pure.

import { createHash } from "node:crypto";

// Deterministic stringify — sort object keys so two equivalent payloads (keys
// in any order) hash identically. Arrays stay order-sensitive (they are data).
function stableStringify(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  const keys = Object.keys(v).sort();
  return `{${keys.map((k) => JSON.stringify(k) + ":" + stableStringify(v[k])).join(",")}}`;
}

export function payloadHash(payload) {
  return createHash("sha256").update(stableStringify(payload ?? {})).digest("hex");
}

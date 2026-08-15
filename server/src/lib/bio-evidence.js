const HIGH_IMPACT_FIELDS = [
  "identity.positioning",
  "identity.category",
  "audience.primary",
  "audience.jtbd",
  "voice.register",
  "voice.forbidden",
  "goals.northStar",
  "strategic.notList",
];

const ARRAY_FIELDS = new Set([
  "identity.pillars",
  "audience.jtbd",
  "voice.forbidden",
  "voice.signatures",
  "strategic.watchouts",
  "strategic.notList",
]);

const clone = (value) => JSON.parse(JSON.stringify(value || {}));

function getPath(payload, dotted) {
  return dotted.split(".").reduce((obj, key) => obj?.[key], payload);
}

function setPath(payload, dotted, value) {
  const parts = dotted.split(".");
  let target = payload;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const part = parts[i];
    if (!target[part] || typeof target[part] !== "object" || Array.isArray(target[part])) target[part] = {};
    target = target[part];
  }
  target[parts[parts.length - 1]] = value;
}

function isEmpty(value) {
  return Array.isArray(value) ? value.length === 0 : value == null || String(value).trim() === "";
}

function uniqueMissing(missing) {
  const seen = new Set();
  return (Array.isArray(missing) ? missing : [])
    .filter((item) => item && typeof item === "object" && item.field)
    .filter((item) => {
      if (seen.has(item.field)) return false;
      seen.add(item.field);
      return true;
    });
}

function missingEntry(field, why) {
  return { field, why: why || "Could not be verified from the provided sources." };
}

export function normalizeBioEvidence(payload = {}) {
  const next = clone(payload);
  next.confidence = next.confidence && typeof next.confidence === "object" ? next.confidence : {};
  next.evidence = next.evidence && typeof next.evidence === "object" ? next.evidence : {};
  next.fieldStatus = next.fieldStatus && typeof next.fieldStatus === "object" ? next.fieldStatus : {};
  next.missing = uniqueMissing(next.missing);

  for (const field of HIGH_IMPACT_FIELDS) {
    const value = getPath(next, field);
    const conf = next.confidence[field]?.conf;
    const source = next.confidence[field]?.source;

    if (isEmpty(value)) {
      if (next.fieldStatus[field] !== "unsupported") next.fieldStatus[field] = "missing";
      if (!next.missing.some((item) => item.field === field)) {
        next.missing.push(missingEntry(field, "No support found in the supplied source material."));
      }
      continue;
    }

    // Field now has a value → it is no longer "missing". Drop any stale
    // missing entry and clear a stale missing/unsupported status so the
    // metadata tracks the value (e.g. after a Steward fills a blank field).
    next.missing = next.missing.filter((item) => item.field !== field);
    if (next.fieldStatus[field] === "missing" || next.fieldStatus[field] === "unsupported") {
      next.fieldStatus[field] = typeof conf === "number" && conf >= 85 ? "supported" : "inferred";
    }

    if (!next.fieldStatus[field]) {
      next.fieldStatus[field] = typeof conf === "number" && conf >= 85 ? "supported" : "inferred";
    }
    if (!next.evidence[field] && source) next.evidence[field] = source;
  }

  return next;
}

export function buildVerificationClaims(payload = {}) {
  return HIGH_IMPACT_FIELDS
    .map((field) => ({
      field,
      value: getPath(payload, field) ?? null,
      confidence: payload.confidence?.[field] ?? null,
    }))
    .filter((claim) => !isEmpty(claim.value));
}

export function applyBioVerification(payload = {}, verification = {}) {
  const next = normalizeBioEvidence(payload);
  const verdicts = Array.isArray(verification?.verdicts) ? verification.verdicts : [];

  for (const raw of verdicts) {
    const field = typeof raw?.field === "string" ? raw.field : "";
    if (!HIGH_IMPACT_FIELDS.includes(field)) continue;

    const status = ["supported", "inferred", "unsupported", "missing"].includes(raw.status)
      ? raw.status
      : "inferred";
    const evidence = typeof raw.evidence === "string" ? raw.evidence.trim() : "";
    const reason = typeof raw.reason === "string" ? raw.reason.trim() : "";
    const conf = typeof raw.confidence === "number" ? Math.max(0, Math.min(100, Math.round(raw.confidence))) : null;

    next.fieldStatus[field] = status;
    if (evidence || reason) next.evidence[field] = evidence || reason;
    if (!next.confidence[field] || typeof next.confidence[field] !== "object") {
      next.confidence[field] = {};
    }
    if (conf != null) next.confidence[field].conf = conf;
    if ((evidence || reason) && !next.confidence[field].source) {
      next.confidence[field].source = evidence || reason;
    }

    if (status === "unsupported" || status === "missing") {
      setPath(next, field, ARRAY_FIELDS.has(field) ? [] : null);
      next.confidence[field].conf = Math.min(next.confidence[field].conf ?? 25, 25);
      if (!next.missing.some((item) => item.field === field)) {
        next.missing.push(missingEntry(field, reason || evidence));
      }
    } else if (status === "inferred") {
      next.confidence[field].conf = Math.min(next.confidence[field].conf ?? 70, 70);
    } else if (status === "supported" && next.confidence[field].conf == null) {
      next.confidence[field].conf = 85;
    }
  }

  return normalizeBioEvidence(next);
}

export { HIGH_IMPACT_FIELDS };

// Deterministic, dependency-free QA for specialist outputs. Each check can be
// used alone or composed with createSpecialistOutputGate.

const DEFAULT_HANDOFF_FIELDS = ["to", "summary", "inputs", "nextStep"];
const DEFAULT_VISUAL_ASPECTS = ["subject", "composition", "lighting", "mood"];

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isPresent(value) {
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return value !== null && value !== undefined;
}

function getPath(value, path) {
  return String(path).split(".").reduce((current, key) => {
    if (current === null || current === undefined) return undefined;
    return current[key];
  }, value);
}

function issue(code, path, message) {
  return { code, path, message };
}

function result(name, issues) {
  return { name, passed: issues.length === 0, issues };
}

function parseOutput(output) {
  if (typeof output !== "string") {
    return { value: output, validJson: isRecord(output) || Array.isArray(output) };
  }

  try {
    return { value: JSON.parse(output.trim()), validJson: true };
  } catch {
    return { value: output, validJson: false };
  }
}

function specialistText(specialist = {}) {
  const payload = isRecord(specialist.payload) ? specialist.payload : {};
  const values = [
    specialist.kind,
    specialist.role,
    specialist.name,
    specialist.type,
    specialist.department,
    ...(Array.isArray(specialist.tags) ? specialist.tags : []),
    payload.kind,
    payload.role,
    payload.name,
    payload.type,
    payload.department,
    ...(Array.isArray(payload.tags) ? payload.tags : []),
  ];
  return values.filter(Boolean).join(" ").toLowerCase();
}

function hasRole(specialist, terms) {
  const text = specialistText(specialist);
  return terms.some((term) => new RegExp(`\\b${term}\\b`, "i").test(text));
}

function optionEnabled(option, inferred) {
  return option === false ? false : option === true || isRecord(option) || inferred;
}

function optionObject(option) {
  return isRecord(option) ? option : {};
}

function headingExists(text, section) {
  const escaped = String(section).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^#{1,6}\\s+${escaped}\\s*$`, "im").test(text);
}

export function checkRequiredOutput({ output, value, validJson, contract = {} }) {
  const issues = [];
  const format = contract.format;

  if (format === "json" && !validJson) {
    issues.push(issue("format.invalid_json", "$", "Output must be valid JSON."));
  } else if (format === "object" && !isRecord(value)) {
    issues.push(issue("format.expected_object", "$", "Output must be an object."));
  } else if (format === "array" && !Array.isArray(value)) {
    issues.push(issue("format.expected_array", "$", "Output must be an array."));
  } else if (format === "text" && (typeof output !== "string" || !output.trim())) {
    issues.push(issue("format.expected_text", "$", "Output must be non-empty text."));
  }

  for (const path of contract.requiredFields || []) {
    if (!isPresent(getPath(value, path))) {
      issues.push(issue("field.missing", path, `Required field "${path}" is missing or empty.`));
    }
  }

  const text = typeof value === "string"
    ? value
    : (typeof value?.body === "string" ? value.body : "");
  for (const section of contract.requiredSections || []) {
    const found = isPresent(getPath(value, section)) || headingExists(text, section);
    if (!found) {
      issues.push(issue("section.missing", section, `Required section "${section}" is missing.`));
    }
  }

  return result("required-output", issues);
}

function citationHasLocator(citation, requireUrl) {
  if (typeof citation === "string") {
    return requireUrl ? /https?:\/\/\S+/i.test(citation) : citation.trim().length > 0;
  }
  if (!isRecord(citation)) return false;
  const locator = citation.url || citation.href || citation.source;
  if (!isPresent(locator)) return false;
  return !requireUrl || /https?:\/\/\S+/i.test(String(locator));
}

function collectNestedEvidence(value, requireUrl, key = "", seen = new Set()) {
  if (value == null || seen.has(value)) return [];
  if (typeof value === "string") {
    if (requireUrl) return value.match(/https?:\/\/[^\s)\]}]+/gi) || [];
    return /source|citation|evidence|url|href/i.test(key) && value.trim() ? [value.trim()] : [];
  }
  if (typeof value !== "object") {
    return !requireUrl && /source|citation|evidence/i.test(key) ? [String(value)] : [];
  }
  seen.add(value);
  if (Array.isArray(value)) return value.flatMap((item) => collectNestedEvidence(item, requireUrl, key, seen));
  return Object.entries(value).flatMap(([childKey, child]) => collectNestedEvidence(child, requireUrl, childKey, seen));
}

export function checkResearchEvidence({ value, specialist = {}, contract = {} }) {
  const inferred = hasRole(specialist, ["research", "researcher", "insights", "analyst"]);
  if (!optionEnabled(contract.research, inferred)) return result("research-evidence", []);

  const options = optionObject(contract.research);
  const paths = options.citationPaths || ["citations", "sources", "evidence"];
  const minCitations = Number.isInteger(options.minCitations) ? Math.max(0, options.minCitations) : 1;
  const requireUrl = options.requireUrl !== false;
  const path = paths.find((candidate) => Array.isArray(getPath(value, candidate)));
  const nestedEvidence = collectNestedEvidence(value, requireUrl);
  const citations = path ? getPath(value, path) : nestedEvidence;
  const issues = [];

  if (citations.length < minCitations) {
    issues.push(issue(
      "research.citations_missing",
      paths[0],
      `Research output needs at least ${minCitations} citation(s).`,
    ));
  }

  citations.forEach((citation, index) => {
    if (!citationHasLocator(citation, requireUrl)) {
      issues.push(issue(
        "research.citation_untraceable",
        `${path || "$"}[${index}]`,
        requireUrl ? "Citation must include an HTTP(S) URL." : "Citation must identify a source.",
      ));
    }
  });

  return result("research-evidence", issues);
}

export function checkHandoff({ value, contract = {} }) {
  if (!optionEnabled(contract.handoff, false)) return result("handoff", []);

  const options = optionObject(contract.handoff);
  const path = options.path || "handoff";
  const handoff = getPath(value, path);
  const issues = [];

  if (!isRecord(handoff)) {
    issues.push(issue("handoff.missing", path, `Cross-agent handoff object "${path}" is missing.`));
    return result("handoff", issues);
  }

  for (const field of options.requiredFields || DEFAULT_HANDOFF_FIELDS) {
    const fieldPath = `${path}.${field}`;
    if (!isPresent(getPath(value, fieldPath))) {
      issues.push(issue("handoff.field_missing", fieldPath, `Handoff field "${field}" is missing or empty.`));
    }
  }

  return result("handoff", issues);
}

const VISUAL_CUES = {
  composition: /\b(composition|framing|frames?|cent(?:er|red)|close-up|wide shot|foreground|background|overhead|symmetr(?:y|ical))\b/i,
  lighting: /\b(light(?:ing|lit)?|daylight|sunlight|shadow|backlit|softbox|golden hour|high-key|low-key)\b/i,
  mood: /\b(mood|tone|atmospher(?:e|ic)|calm|energetic|playful|dramatic|intimate|warm|cool|serene|bold|editorial)\b/i,
};

function narrativeVisualAspects(direction, minWords) {
  const text = String(direction).trim();
  const found = new Set();
  if (text.split(/\s+/).filter(Boolean).length >= minWords) found.add("subject");
  for (const [aspect, pattern] of Object.entries(VISUAL_CUES)) {
    if (pattern.test(text)) found.add(aspect);
  }
  return found;
}

export function checkVisualDirection({ value, specialist = {}, contract = {} }) {
  const inferred = hasRole(specialist, ["visual", "image", "designer", "art director", "photographer", "illustrator"]);
  if (!optionEnabled(contract.visualDirection, inferred)) return result("visual-direction", []);

  const options = optionObject(contract.visualDirection);
  const path = options.path || "visualDirection";
  const aspects = options.requiredAspects || DEFAULT_VISUAL_ASPECTS;
  const direction = getPath(value, path);
  const issues = [];

  if (!isPresent(direction)) {
    issues.push(issue("visual.direction_missing", path, `Visual direction "${path}" is missing or empty.`));
    return result("visual-direction", issues);
  }

  const found = isRecord(direction)
    ? new Set(aspects.filter((aspect) => isPresent(getPath(direction, aspect))))
    : narrativeVisualAspects(direction, options.minWords || 6);

  for (const aspect of aspects) {
    if (!found.has(aspect)) {
      issues.push(issue(
        "visual.aspect_missing",
        `${path}.${aspect}`,
        `Visual direction must specify ${aspect}.`,
      ));
    }
  }

  return result("visual-direction", issues);
}

export const specialistOutputChecks = Object.freeze({
  requiredOutput: checkRequiredOutput,
  researchEvidence: checkResearchEvidence,
  handoff: checkHandoff,
  visualDirection: checkVisualDirection,
});

const DEFAULT_CHECKS = Object.freeze(Object.values(specialistOutputChecks));

export function createSpecialistOutputGate({ checks = DEFAULT_CHECKS } = {}) {
  if (!Array.isArray(checks) || checks.some((check) => typeof check !== "function")) {
    throw new TypeError("checks must be an array of functions");
  }

  return function evaluate({ output, specialist = {}, contract = {} } = {}) {
    const parsed = parseOutput(output);
    const context = { output, ...parsed, specialist, contract };
    const results = checks.map((check) => check(context));
    const issues = results.flatMap((checkResult) => checkResult.issues || []);
    return { passed: issues.length === 0, issues, checks: results };
  };
}

export const qaSpecialistOutput = createSpecialistOutputGate();

export function contractFromSpecialist(specialist = {}) {
  const payload = isRecord(specialist.payload) ? specialist.payload : specialist;
  const explicit = isRecord(payload.qaContract) ? payload.qaContract : {};
  const schema = isRecord(payload.structuredOutput) ? payload.structuredOutput : null;
  const hasStructuredOutput = schema || (typeof payload.structuredOutput === "string" && payload.structuredOutput.trim());
  const inferred = {
    ...(hasStructuredOutput ? { format: schema ? "object" : "json" } : {}),
    ...(schema ? { requiredFields: Object.keys(schema) } : {}),
    research: payload.evidenceContract ? true : undefined,
    handoff: schema && Object.hasOwn(schema, "handoff") ? true : false,
    visualDirection: schema && Object.hasOwn(schema, "visualDirection") ? true : false,
  };
  return { ...inferred, ...explicit };
}

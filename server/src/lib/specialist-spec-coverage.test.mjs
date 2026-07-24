import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createContext, runInContext } from "node:vm";

const __dirname = dirname(fileURLToPath(import.meta.url));
const portalDataPath = join(__dirname, "../../../src/portal-data.js");
const source = readFileSync(portalDataPath, "utf8");
const fakeWindow = {};
const sandbox = {
  window: fakeWindow,
  localStorage: { getItem: () => null, setItem: () => {} },
  Event: class Event {},
};

createContext(sandbox);
runInContext(source, sandbox, { filename: portalDataPath });

const specialists = fakeWindow.CI_AGENTS;
const specialistSpecs = fakeWindow.CI_SPECIALIST_SPECS;
const REQUIRED_TEXT_FIELDS = ["role", "objective", "outputContract", "voice"];
const REQUIRED_LIST_FIELDS = ["method", "refusals", "bioSlices"];
const EXCLUDED_MOTION_VIDEO_IDS = new Set(["a44"]);

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isNonEmptyStringList(value) {
  return Array.isArray(value) && value.length > 0 && value.every(isNonEmptyString);
}

test("bespoke specs only use known specialist ids", () => {
  assert.ok(Array.isArray(specialists), "CI_AGENTS must be an array");
  assert.ok(specialistSpecs && typeof specialistSpecs === "object", "CI_SPECIALIST_SPECS must be an object");

  const knownIds = new Set(specialists.map(({ id }) => id));
  const unknownIds = Object.keys(specialistSpecs).filter((id) => !knownIds.has(id));

  assert.deepEqual(unknownIds, [], `Unknown bespoke specialist ids: ${unknownIds.join(", ")}`);
});

test("every in-scope non-motion/video specialist has a complete bespoke spec", () => {
  assert.ok(Array.isArray(specialists), "CI_AGENTS must be an array");
  assert.ok(specialistSpecs && typeof specialistSpecs === "object", "CI_SPECIALIST_SPECS must be an object");

  const scopedSpecialists = specialists.filter(
    ({ id, dept }) => dept !== "Motion & Sound" && !EXCLUDED_MOTION_VIDEO_IDS.has(id),
  );
  const failures = [];

  for (const specialist of scopedSpecialists) {
    if (!Object.hasOwn(specialistSpecs, specialist.id)) {
      failures.push(`${specialist.id} ${specialist.name}: missing bespoke spec`);
      continue;
    }

    const spec = specialistSpecs[specialist.id];
    const invalidFields = [
      ...REQUIRED_TEXT_FIELDS.filter((field) => !isNonEmptyString(spec[field])),
      ...REQUIRED_LIST_FIELDS.filter((field) => !isNonEmptyStringList(spec[field])),
    ];

    if (invalidFields.length > 0) {
      failures.push(`${specialist.id} ${specialist.name}: invalid ${invalidFields.join(", ")}`);
    }
  }

  assert.deepEqual(
    failures,
    [],
    `Incomplete bespoke specialist specs (${failures.length}/${scopedSpecialists.length}):\n${failures.join("\n")}`,
  );
});

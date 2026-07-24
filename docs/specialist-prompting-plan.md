# Specialist creation & prompting — plan

_Status: IMPLEMENTED for the 49-specialist non-motion/video scope. This plan reflects the expanded catalog currently defined in `src/portal-data.js`._

## 0. Catalog baseline and completion scope

`CI_AGENTS` now contains **55 L2 specialists across seven departments**:

| Department | Catalog | Live | Completion scope |
|---|---:|---:|---:|
| Strategy | 6 | 6 | 6 |
| Concept | 8 | 8 | 8 |
| Copy | 11 | 11 | 11 |
| Visual | 11 | 11 | 10 |
| Web & UX | 7 | 7 | 7 |
| Motion & Sound | 5 | 0 | 0 |
| Research & Ops | 7 | 7 | 7 |
| **Total** | **55** | **50** | **49** |

This milestone is complete only when **all 49 non-motion/video specialists** have valid bespoke prompt specs, regardless of current status. Motion/video work is explicitly deferred: the five `Motion & Sound` records (`a27`, `a28`, `a50`, `a51`, `a52`) plus `a44 Style Frames` (video preproduction housed under Visual) are not part of this completion gate. Their existing draft specs may remain, but they do not count toward completion.

`CI_SPECIALIST_SPECS` contains a complete bespoke entry for every in-scope specialist. The standalone test is the authoritative regression gate; static counts here must stay aligned with the catalog.

`server/src/lib/specialist-spec-coverage.test.mjs` is the executable catalog gate. It evaluates `src/portal-data.js` and fails when any in-scope catalog record has no own entry in `CI_SPECIALIST_SPECS`, when that entry is missing a required core field, or when the bespoke map contains an unknown specialist id. Department templates are useful runtime fallbacks, but do not satisfy bespoke-spec completion.

## 1. What a specialist spec is

`CI_AGENTS` remains lean directory and routing metadata: `id, code, dept, name, job, model, cr, status`, with optional `internal`. Runnable behavior belongs in `CI_SPECIALIST_SPECS`, keyed by specialist id.

Every in-scope bespoke spec must define these core fields directly:

```js
{
  role,            // non-empty one-line identity
  objective,       // non-empty statement of a successful run
  method,          // non-empty ordered string[]
  outputContract,  // non-empty shape, limits, and acceptance contract
  voice,           // non-empty specialist-specific voice constraint
  refusals,        // non-empty hard-rule string[]
  bioSlices,       // non-empty BIO field-name string[]
}
```

Optional fields such as `tools`, `inputs`, and `modelRouting` can be added as the runtime needs them. `CI_DEPT_SPECS` provides department defaults for composition and migration, while `CI_DEPT_META` provides shared `capabilities`, `bestFor`, `turnaround`, and `tierFrom`. Neither replaces the bespoke core fields above for an in-scope specialist.

## 2. The prompt is assembled, not authored as one blob

A specialist's effective system prompt is composed at run time from four layers:

```
[ PLATFORM PREAMBLE ]   constant L2 role and operating constraints
        +
[ BRAND CONTEXT (BIO) ] the department-relevant BIO slice and brand refusals
        +
[ SPECIALIST SPEC ]     role · objective · method · outputContract · refusals · voice
        +
[ TASK CONTEXT ]        sharpened brief + relevant prior outputs/uploads
```

This keeps brand truth centralized while making each specialist's judgment, process, and deliverable contract independently reviewable. A BIO change must not require edits to 49 specs.

## 3. BIO grounding and refusals

- Every prompt carries only the BIO slices relevant to that specialist's department.
- Brand-global refusals are inherited; bespoke `refusals` narrow and extend them.
- Brand Consistency QA (`a24`) applies those rules before an output becomes `approved`.
- The team-side drawer exposes the composed PLATFORM + BIO + SPEC prompt and lists refusals in plain language.

The core-field gate checks authoring completeness, not semantic quality. Spec review and dry runs must still verify that each role, method, contract, voice, and refusal set is genuinely distinct and appropriate.

## 4. Model routing

- `CI_AGENTS[].model` remains the current catalog route key.
- Persisted specs make routing explicit as `modelRouting: { primary, fallback, reason }` when seeded to the backend.
- Clients see the specialist and department, never vendor/model details.
- Team views may show the model plus the routing reason.
- Routing is data, not component logic.

## 5. Authoring flow

1. **Close the coverage gap.** Author bespoke specs for every uncovered in-scope specialist until the standalone coverage test passes; the test output is the authoritative current gap.
2. **Dry-run harness.** Run each specialist against a sample brief and BIO, then apply the refusal/QA gate before accepting the spec.
3. **Admin authoring.** Add identity, core spec fields, routing, credits, tier, status, and a live composed-prompt preview.
4. **Versioning and governance.** Changes to live specs create versions and retain the tested BIO version and diff.
5. **Brandolph-assisted authoring.** Brandolph may propose a draft spec, but a human reviews it before activation.

Motion/video authoring, vendor integration, and activation are a later milestone and do not block steps 1-4 for the 49 in-scope specialists.

## 6. Connections to the product

- The specialist drawer is the read view of a spec and its composed prompt.
- Assembly contributes each selected specialist's spec and sums `cr` estimates.
- Library outputs currently retain legacy `agentId` keys; the terminology migration can preserve compatibility while the UI says "specialist."
- Seeded backend rows inherit catalog metadata and department metadata, but the source bespoke spec remains `CI_SPECIALIST_SPECS[specialist.id]`.

## 7. Completion criteria

- `CI_AGENTS` evaluates to exactly the current 55-record catalog.
- Every record outside the six deferred motion/video roles, regardless of status, has its own bespoke spec.
- Each scoped spec has non-empty `role`, `objective`, `method`, `outputContract`, `voice`, `refusals`, and `bioSlices` fields of the expected type.
- Every `CI_SPECIALIST_SPECS` key resolves to a catalog specialist id.
- The standalone Node coverage test passes.
- Motion/video remains deferred and cannot be used to claim or block completion of this milestone.

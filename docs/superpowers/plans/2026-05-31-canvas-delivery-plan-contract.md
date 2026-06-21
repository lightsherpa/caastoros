# Canvas Delivery Plan — Plan 1: Contract Foundation (server)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Brandolph/the Sharpener emit a structured, typed, multi-platform **Delivery Plan** (not a flat text-only specialist list), backed by a deliverable taxonomy and a platform-spec registry — so downstream phases can produce N complete, per-platform deliverables.

**Architecture:** Three new pure server modules (platform registry, deliverable taxonomy, delivery-plan helpers), plus a rewrite of the Sharpener's prompt + parse to return a `deliveryPlan`. The `/api/briefs/sharpen` route needs no change — it already spreads the Sharpener result. Back-compat: a derived `proposedSpecialists` list is still returned so the current client keeps working until the canvas/UX plans land.

**Tech Stack:** Node ESM (`.js`/`.mjs`), Hono, existing `streamCompletion` router. Tests use Node's **built-in `node:test` + `node:assert/strict`** for pure functions (zero new deps) and the existing `.mjs` live-smoke pattern for the API. **No vitest/jest, no tooling change.**

**Standing rules honored:** only credits shown to users (no API cost in product surface); cost-at-scale guardrails (hard count/group caps); don't touch unrelated flow; keep `fluxSchnell` runnable; never rename the project. Commits follow the repo rule "commit only when the user asks" — the commit steps below are the intended rhythm; confirm before running them if executing inline.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `server/src/lib/platforms.js` (new) | Platform-spec registry: id → image dims, copy length, tone. Single source for both copy contract + image gen. |
| `server/src/lib/taxonomy.js` (new) | Deliverable-type registry: type → parts, default crew, platform-sensitive parts. |
| `server/src/lib/delivery-plan.js` (new) | Pure helpers: `normalizePlan`, `wrapLegacy`, `estimateCr`. Validation + cost + back-compat. |
| `server/src/lib/sharpener.js` (modify) | Prompt rewrite to emit `deliveryPlan`; parse + normalize; derive `proposedSpecialists`. |
| `server/src/lib/platforms.test.mjs` (new) | Unit tests for the platform registry. |
| `server/src/lib/taxonomy.test.mjs` (new) | Unit tests for the taxonomy registry. |
| `server/src/lib/delivery-plan.test.mjs` (new) | Unit tests for the delivery-plan helpers. |
| `scripts/test-delivery-plan.mjs` (new) | Live smoke: POST `/api/briefs/sharpen`, assert plan shape (visual parts + platforms present). |
| `package.json` (modify) | Add `test:plan` + `test:units` scripts. |

`server/src/routes/briefs.js` — **no change** (line 49 spreads `...result`).

---

## Task 1: Platform-spec registry

**Files:**
- Create: `server/src/lib/platforms.js`
- Test: `server/src/lib/platforms.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// server/src/lib/platforms.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { PLATFORM_SPECS, platformSpec, isPlatform, DEFAULT_PLATFORM } from "./platforms.js";

test("known platforms expose image dims + tone", () => {
  for (const id of ["instagram", "linkedin", "x", "tiktok", "blog", "deck", "email", "generic"]) {
    const s = PLATFORM_SPECS[id];
    assert.ok(s, `missing platform ${id}`);
    assert.equal(typeof s.image.w, "number");
    assert.equal(typeof s.image.h, "number");
    assert.equal(typeof s.tone, "string");
  }
});

test("instagram is square 1080, linkedin is 1200x627", () => {
  assert.deepEqual(platformSpec("instagram").image, { w: 1080, h: 1080 });
  assert.deepEqual(platformSpec("linkedin").image, { w: 1200, h: 627 });
});

test("platformSpec falls back to generic for unknown ids", () => {
  assert.equal(platformSpec("myspace"), PLATFORM_SPECS.generic);
});

test("isPlatform + DEFAULT_PLATFORM", () => {
  assert.equal(isPlatform("tiktok"), true);
  assert.equal(isPlatform("myspace"), false);
  assert.equal(DEFAULT_PLATFORM, "generic");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test server/src/lib/platforms.test.mjs`
Expected: FAIL — `Cannot find module './platforms.js'`.

- [ ] **Step 3: Write the implementation**

```js
// server/src/lib/platforms.js
// Platform-spec registry. The single source of truth for how a deliverable
// part is re-fitted per channel: image dimensions, copy length, tone. Read
// by both the copy contract (compose-specialist-prompt) and image gen
// (compose-image-prompt) in later phases.

export const PLATFORM_SPECS = {
  instagram:       { label: "Instagram",       image: { w: 1080, h: 1080 }, copyMaxChars: 2200, tone: "visual-first, hooky" },
  instagram_story: { label: "Instagram Story", image: { w: 1080, h: 1920 }, copyMaxChars: 160,  tone: "vertical, ephemeral" },
  linkedin:        { label: "LinkedIn",        image: { w: 1200, h: 627 },  copyMaxChars: 1300, tone: "professional, POV-led" },
  x:               { label: "X (Twitter)",     image: { w: 1600, h: 900 },  copyMaxChars: 280,  tone: "terse, punchy" },
  tiktok:          { label: "TikTok",          image: { w: 1080, h: 1920 }, copyMaxChars: 300,  tone: "native, casual" },
  facebook:        { label: "Facebook",        image: { w: 1200, h: 630 },  copyMaxChars: 600,  tone: "broad reach" },
  blog:            { label: "Blog / Web",      image: { w: 1600, h: 900 },  copyMaxChars: null, tone: "editorial, long-form" },
  deck:            { label: "Deck",            image: { w: 1920, h: 1080 }, copyMaxChars: null, tone: "presentation" },
  email:           { label: "Email",           image: { w: 600,  h: 400 },  copyMaxChars: null, tone: "direct, scannable" },
  generic:         { label: "Generic",         image: { w: 1080, h: 1080 }, copyMaxChars: null, tone: "brand-default" },
};

export const DEFAULT_PLATFORM = "generic";

export function isPlatform(id) {
  return Object.prototype.hasOwnProperty.call(PLATFORM_SPECS, id);
}

export function platformSpec(id) {
  return PLATFORM_SPECS[id] || PLATFORM_SPECS[DEFAULT_PLATFORM];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test server/src/lib/platforms.test.mjs`
Expected: PASS — 4 tests, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/platforms.js server/src/lib/platforms.test.mjs
git commit -m "feat(canvas): add platform-spec registry"
```

---

## Task 2: Deliverable taxonomy

**Files:**
- Create: `server/src/lib/taxonomy.js`
- Test: `server/src/lib/taxonomy.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// server/src/lib/taxonomy.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { DELIVERABLE_TYPES, typeSpec, isType, DEFAULT_TYPE } from "./taxonomy.js";

test("every type declares parts + crew covering each part", () => {
  for (const [id, spec] of Object.entries(DELIVERABLE_TYPES)) {
    assert.ok(Array.isArray(spec.parts) && spec.parts.length > 0, `${id} has no parts`);
    for (const part of spec.parts) {
      assert.ok(spec.crew[part], `${id}.crew missing part ${part}`);
      assert.match(spec.crew[part], /^a\d{2}$/, `${id}.crew.${part} not an agent id`);
    }
    for (const p of spec.platformSensitive) {
      assert.ok(spec.parts.includes(p), `${id}.platformSensitive lists unknown part ${p}`);
    }
  }
});

test("social_post pairs caption + image and is visual", () => {
  const s = typeSpec("social_post");
  assert.deepEqual(s.parts, ["caption", "image"]);
  assert.equal(s.crew.image, "a41");
  assert.equal(s.visual, true);
});

test("blog_article carries a hero image", () => {
  const s = typeSpec("blog_article");
  assert.ok(s.parts.includes("hero_image"));
  assert.equal(s.visual, true);
});

test("legacy type exists for back-compat and is single-part", () => {
  const s = typeSpec("legacy");
  assert.deepEqual(s.parts, ["output"]);
});

test("isType + DEFAULT_TYPE + unknown returns null", () => {
  assert.equal(isType("deck"), true);
  assert.equal(isType("nope"), false);
  assert.equal(typeSpec("nope"), null);
  assert.equal(DEFAULT_TYPE, "social_post");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test server/src/lib/taxonomy.test.mjs`
Expected: FAIL — `Cannot find module './taxonomy.js'`.

- [ ] **Step 3: Write the implementation**

```js
// server/src/lib/taxonomy.js
// Deliverable-type registry. One entry = one shippable artifact shape.
// `parts` are the components of a single deliverable; `crew` maps each part
// to the specialist that produces it; `platformSensitive` lists the parts
// whose spec changes per platform (§4.3a of the design). All crew ids must
// exist in CI_AGENTS / CI_SPECIALIST_SPECS.

export const DELIVERABLE_TYPES = {
  social_post:     { label: "Social post",     parts: ["caption", "image"],                 crew: { caption: "a16", image: "a41" },                      platformSensitive: ["caption", "image"], visual: true },
  carousel:        { label: "Carousel",        parts: ["caption", "frames"],                crew: { caption: "a16", frames: "a41" },                     platformSensitive: ["caption", "frames"], visual: true },
  ad_creative:     { label: "Ad creative",     parts: ["headline", "body", "image"],        crew: { headline: "a37", body: "a12", image: "a42" },        platformSensitive: ["headline", "body", "image"], visual: true },
  blog_article:    { label: "Blog article",    parts: ["body", "hero_image"],               crew: { body: "a15", hero_image: "a21" },                    platformSensitive: ["hero_image"], visual: true },
  deck:            { label: "Deck",            parts: ["outline", "slides"],                crew: { outline: "a36", slides: "a44" },                     platformSensitive: ["slides"], visual: true },
  key_visual:      { label: "Key visual",      parts: ["image", "concept"],                 crew: { image: "a20", concept: "a08" },                      platformSensitive: ["image"], visual: true },
  email:           { label: "Email",           parts: ["subject", "body"],                  crew: { subject: "a14", body: "a13" },                       platformSensitive: ["body"], visual: false },
  email_sequence:  { label: "Email sequence",  parts: ["subject", "body"],                  crew: { subject: "a14", body: "a13" },                       platformSensitive: ["body"], visual: false },
  newsletter:      { label: "Newsletter",      parts: ["subject", "body", "hero_image"],    crew: { subject: "a14", body: "a13", hero_image: "a21" },     platformSensitive: ["hero_image"], visual: true },
  case_study:      { label: "Case study",      parts: ["narrative", "pull_quotes", "hero_image"], crew: { narrative: "a15", pull_quotes: "a09", hero_image: "a21" }, platformSensitive: ["hero_image"], visual: true },
  landing_section: { label: "Landing section", parts: ["heading", "body"],                  crew: { heading: "a12", body: "a17" },                       platformSensitive: ["body"], visual: false },
  naming:          { label: "Naming",          parts: ["name", "rationale"],                crew: { name: "a07", rationale: "a07" },                     platformSensitive: [], visual: false },
  tagline:         { label: "Tagline",         parts: ["line"],                             crew: { line: "a09" },                                       platformSensitive: [], visual: false },
  mood_frame:      { label: "Mood frame",      parts: ["image"],                            crew: { image: "a35" },                                      platformSensitive: ["image"], visual: true },
  hero_kv:         { label: "Hero KV",         parts: ["image"],                            crew: { image: "a20" },                                      platformSensitive: ["image"], visual: true },
  infographic:     { label: "Infographic",     parts: ["spec", "image"],                    crew: { spec: "a45", image: "a45" },                         platformSensitive: ["image"], visual: true },
  // back-compat: a single specialist output with no deliverable structure.
  legacy:          { label: "Output",          parts: ["output"],                           crew: { output: "a01" },                                     platformSensitive: [], visual: false },
};

export const DEFAULT_TYPE = "social_post";

export function isType(id) {
  return Object.prototype.hasOwnProperty.call(DELIVERABLE_TYPES, id);
}

export function typeSpec(id) {
  return DELIVERABLE_TYPES[id] || null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test server/src/lib/taxonomy.test.mjs`
Expected: PASS — 5 tests, 0 fail. (The first test guards that every crew id is `aNN`-shaped and covers every part — fix any typo it catches.)

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/taxonomy.js server/src/lib/taxonomy.test.mjs
git commit -m "feat(canvas): add deliverable-type taxonomy"
```

---

## Task 3: Delivery-plan helpers (normalize / wrapLegacy / estimateCr)

**Files:**
- Create: `server/src/lib/delivery-plan.js`
- Test: `server/src/lib/delivery-plan.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// server/src/lib/delivery-plan.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizePlan, wrapLegacy, estimateCr, MAX_COUNT } from "./delivery-plan.js";

test("normalizePlan fills parts/crew from taxonomy and clamps count", () => {
  const out = normalizePlan({
    deliverableGroups: [{ type: "social_post", count: 999, platforms: ["instagram", "linkedin"] }],
  });
  const g = out.deliverableGroups[0];
  assert.equal(g.count, MAX_COUNT);                 // clamped
  assert.deepEqual(g.parts, ["caption", "image"]);  // filled from taxonomy
  assert.equal(g.crew.image, "a41");                // filled from taxonomy
  assert.deepEqual(g.platforms, ["instagram", "linkedin"]);
});

test("normalizePlan drops unknown types and bad platforms, defaults platform", () => {
  const out = normalizePlan({
    deliverableGroups: [
      { type: "nonsense", count: 2 },
      { type: "email", count: 3, platforms: ["myspace"] },
    ],
  });
  assert.equal(out.deliverableGroups.length, 1);            // nonsense dropped
  assert.equal(out.deliverableGroups[0].type, "email");
  assert.deepEqual(out.deliverableGroups[0].platforms, ["generic"]); // bad platform -> default
});

test("normalizePlan derives unique proposedSpecialists across groups", () => {
  const out = normalizePlan({
    deliverableGroups: [
      { type: "social_post", count: 5, platforms: ["instagram"] }, // a16, a41
      { type: "email", count: 2 },                                  // a14, a13
    ],
  });
  assert.deepEqual([...out.proposedSpecialists].sort(), ["a13", "a14", "a16", "a41"]);
});

test("normalizePlan returns empty plan for junk input", () => {
  assert.deepEqual(normalizePlan(null), { deliverableGroups: [], proposedSpecialists: [] });
  assert.deepEqual(normalizePlan({}), { deliverableGroups: [], proposedSpecialists: [] });
});

test("wrapLegacy turns a flat specialist list into count:1 generic groups", () => {
  const out = wrapLegacy(["a12", "a18"]);
  assert.equal(out.deliverableGroups.length, 2);
  assert.equal(out.deliverableGroups[0].type, "legacy");
  assert.equal(out.deliverableGroups[0].count, 1);
  assert.deepEqual(out.deliverableGroups[0].platforms, ["generic"]);
  assert.equal(out.deliverableGroups[0].crew.output, "a12");
});

test("estimateCr multiplies count x platforms x sum(part cr); null without crOf", () => {
  const plan = normalizePlan({ deliverableGroups: [{ type: "social_post", count: 5, platforms: ["instagram", "linkedin"] }] });
  const crOf = (id) => ({ a16: 3, a41: 8 }[id] ?? 0);     // 11 per deliverable
  assert.equal(estimateCr(plan, crOf), 5 * 2 * 11);        // 110
  assert.equal(estimateCr(plan), null);                    // no crOf -> unknown
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test server/src/lib/delivery-plan.test.mjs`
Expected: FAIL — `Cannot find module './delivery-plan.js'`.

- [ ] **Step 3: Write the implementation**

```js
// server/src/lib/delivery-plan.js
// Pure helpers around a DeliveryPlan. No I/O. Validates a plan the Sharpener
// emitted against the taxonomy + platform registries, fills defaults, clamps
// to cost guardrails, derives a back-compat specialist list, and estimates
// credits when given a cr lookup.

import { typeSpec, isType } from "./taxonomy.js";
import { isPlatform, DEFAULT_PLATFORM } from "./platforms.js";

export const MAX_COUNT = 20;   // per-group hard cap (cost-at-scale guardrail)
export const MAX_GROUPS = 6;   // per-plan hard cap

function clampCount(n) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v) || v < 1) return 1;
  return Math.min(MAX_COUNT, v);
}

function normalizeGroup(raw) {
  if (!raw || !isType(raw.type) || raw.type === "legacy") {
    // Unknown/missing type can't be rendered downstream -> drop.
    // (legacy groups only come from wrapLegacy, never the Sharpener.)
    return null;
  }
  const spec = typeSpec(raw.type);
  const platforms = (Array.isArray(raw.platforms) ? raw.platforms : [])
    .filter(isPlatform);
  const crew = { ...spec.crew };
  if (raw.crew && typeof raw.crew === "object") {
    for (const part of spec.parts) {
      if (typeof raw.crew[part] === "string") crew[part] = raw.crew[part];
    }
  }
  return {
    type: raw.type,
    count: clampCount(raw.count),
    platforms: platforms.length ? platforms : [DEFAULT_PLATFORM],
    parts: [...spec.parts],
    crew,
  };
}

export function normalizePlan(plan) {
  const groups = Array.isArray(plan?.deliverableGroups) ? plan.deliverableGroups : [];
  const deliverableGroups = groups
    .map(normalizeGroup)
    .filter(Boolean)
    .slice(0, MAX_GROUPS);

  const ids = new Set();
  for (const g of deliverableGroups) {
    for (const part of g.parts) ids.add(g.crew[part]);
  }
  return { deliverableGroups, proposedSpecialists: [...ids] };
}

export function wrapLegacy(specialistIds = []) {
  const deliverableGroups = (Array.isArray(specialistIds) ? specialistIds : [])
    .filter((id) => typeof id === "string" && id)
    .map((id) => ({
      type: "legacy",
      count: 1,
      platforms: [DEFAULT_PLATFORM],
      parts: ["output"],
      crew: { output: id },
    }));
  return { deliverableGroups, proposedSpecialists: [...new Set(specialistIds)] };
}

// crOf: (agentId) => number of credits for that specialist. Returns null when
// no lookup is supplied (the client computes the user-facing estimate in the
// UX plan, where CI_AGENTS cr is available).
export function estimateCr(plan, crOf) {
  if (typeof crOf !== "function") return null;
  let total = 0;
  for (const g of plan?.deliverableGroups || []) {
    const perDeliverable = g.parts.reduce((s, part) => s + (Number(crOf(g.crew[part])) || 0), 0);
    total += g.count * g.platforms.length * perDeliverable;
  }
  return total;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test server/src/lib/delivery-plan.test.mjs`
Expected: PASS — 6 tests, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/delivery-plan.js server/src/lib/delivery-plan.test.mjs
git commit -m "feat(canvas): add delivery-plan normalize/wrap/estimate helpers"
```

---

## Task 4: Sharpener emits a Delivery Plan

**Files:**
- Modify: `server/src/lib/sharpener.js` (prompt block `SHARPENER_SYSTEM:43-48` + `:59-70`; return `:189-229`)

- [ ] **Step 1: Replace the task line that excludes visuals + caps the crew**

In `SHARPENER_SYSTEM`, replace the line (currently `:48`):

```
4. Propose 2–4 text specialists from a01–a18 that should run on this brief.
```

with:

```
4. Produce a DELIVERY PLAN — the concrete, shippable deliverables this brief should yield, grouped by type, with how many and for which platforms. This REPLACES any flat specialist list. Sizing and pairing rules below.
```

- [ ] **Step 2: Replace the OUTPUT JSON block to emit `deliveryPlan`**

Replace the JSON schema block (currently `:59-70`, from `OUTPUT — STRICT JSON ONLY` through the closing `}`) with:

```
OUTPUT — STRICT JSON ONLY, no preamble, no fences:

{
  "title": "4–6 words. The brief named like a magazine spread, not a JIRA ticket. No verbs like 'unlock', 'drive', 'leverage'. No 'How to', no 'The ultimate', no colons-as-subtitles. Sounds written by a human editor.",
  "tension": "one-sentence diagnosis of the strategic tension. Plain prose. No 'The tension is:' framing.",
  "sharpenedBrief": "2–3 sentences a CMO would say out loud over coffee. No bullet lists. No 'Here's what we need to do:'. Start with the work, not a meta-comment about it.",
  "questions": [
    { "q": "the question, posed directly", "why": "the BIO field this connects to, quoted or paraphrased" }
  ],
  "deliveryPlan": {
    "deliverableGroups": [
      {
        "type": "one of: social_post, carousel, ad_creative, blog_article, deck, key_visual, email, email_sequence, newsletter, case_study, landing_section, naming, tagline, mood_frame, hero_kv, infographic",
        "count": 5,
        "platforms": ["instagram", "linkedin"],
        "parts": ["caption", "image"],
        "crew": { "caption": "a16", "image": "a41" }
      }
    ]
  },
  "refusals": ["explicit don'ts derived from BIO refusals + brief"]
}

DELIVERY PLAN RULES:
- Infer COUNT from the brief: "a week of content" → 5–7; "5 posts" → 5; a single asset → 1. The user can adjust before running, so propose the honest number, not a timid one.
- Infer PLATFORMS from the brief ("Instagram", "LinkedIn", "carousel"→instagram). If the brief is explicit, use it. If it implies a channel, set it. If genuinely ambiguous, add ONE question asking which platforms — and still propose a best-guess platform array.
- Pick the smallest set of TYPES that fully earns the brief. A "week of social content" is usually one social_post group with count 5–7. A launch may need social_post + hero_kv. A blog brief is blog_article (which already includes its hero image).
- Every group's `parts` + `crew` should match the type's natural shape (caption+image for social, body+hero_image for blog, etc.). If a part needs a visual, the crew id MUST be a visual specialist (a19–a46).
- If the brief implies ANY visual output (social, ad, launch, hero, carousel, mood, deck, blog hero), the plan MUST include the matching visual part/specialist. A social plan with no image specialist is wrong.
- Do NOT include a02 (you), a18 Voice QA (auto on text), or a24 Brand Consistency QA (auto on images).
```

> Keep everything between `TITLE EXAMPLES` and the end of the specialist roster (`:72-146`) as-is — it already lists the full visual roster and the channel-pairing heuristics, which now serve the Delivery Plan. The only deletions are the old `proposedSpecialists` schema key and the line replaced in Step 1.

- [ ] **Step 3: Bump the Sharpener output token budget**

In `sharpenBrief`, change `maxTokens: 1200` (`:205`) to `maxTokens: 1600` — the plan + rationale is slightly larger than the old flat list.

- [ ] **Step 4: Rewrite the parse/return to normalize the plan + keep back-compat**

Replace the `import` line at `:18` to add the helpers:

```js
import { streamCompletion } from "./models/router.js";
import { normalizePlan, wrapLegacy } from "./delivery-plan.js";
```

Replace the `return { ... }` block (`:220-228`) with:

```js
  // New path: Sharpener emitted a deliveryPlan -> normalize against the
  // taxonomy/platform registries. Back-compat: if it only gave the legacy
  // flat list (or the plan normalized to nothing), wrap that list so
  // downstream always has a plan + a derived specialist list.
  let plan = normalizePlan(parsed.deliveryPlan);
  if (plan.deliverableGroups.length === 0) {
    const legacyIds = Array.isArray(parsed.proposedSpecialists)
      ? parsed.proposedSpecialists.slice(0, 4)
      : [];
    plan = wrapLegacy(legacyIds);
  }

  return {
    title:               parsed.title || "",
    tension:             parsed.tension || "",
    sharpenedBrief:      parsed.sharpenedBrief || "",
    questions:           Array.isArray(parsed.questions) ? parsed.questions.slice(0, 3) : [],
    deliveryPlan:        plan,                          // { deliverableGroups, proposedSpecialists }
    proposedSpecialists: plan.proposedSpecialists,      // back-compat for the current client
    refusals:            Array.isArray(parsed.refusals) ? parsed.refusals : [],
    usage,
  };
```

- [ ] **Step 5: Verify the module still imports cleanly**

Run: `node --check server/src/lib/sharpener.js && node -e "import('./server/src/lib/sharpener.js').then(()=>console.log('import OK'))"`
Expected: `import OK` (no syntax/resolution error). This does not call the model — that's the smoke script in Task 5.

- [ ] **Step 6: Commit**

```bash
git add server/src/lib/sharpener.js
git commit -m "feat(canvas): Sharpener emits a structured Delivery Plan (visuals + platforms)"
```

---

## Task 5: Live smoke script

**Files:**
- Create: `scripts/test-delivery-plan.mjs`
- Modify: `package.json` (scripts)

- [ ] **Step 1: Write the smoke script**

```js
// scripts/test-delivery-plan.mjs
// Live smoke for the Delivery Plan contract. Signs in, POSTs a social brief
// to /api/briefs/sharpen, and asserts the returned plan includes a visual
// part and at least one platform. Mirrors scripts/test-run.mjs conventions.
//
// Run:
//   EMAIL=... PASSWORD=... npm run test:plan

import { createClient } from "@supabase/supabase-js";

const EMAIL    = process.env.EMAIL;
const PASSWORD = process.env.PASSWORD;
const API_BASE = process.env.API_BASE || "http://localhost:8787";
const BRIEF    = process.env.BRIEF || "A week of Instagram and LinkedIn content for the spring drop.";

if (!EMAIL || !PASSWORD) {
  console.error("Usage: EMAIL=... PASSWORD=... [BRIEF='...'] npm run test:plan");
  process.exit(1);
}

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const { data: auth, error: authErr } = await sb.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
if (authErr) { console.error("Sign-in failed:", authErr.message); process.exit(1); }
const jwt = auth.session.access_token;

const res = await fetch(`${API_BASE}/api/briefs/sharpen`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
  body: JSON.stringify({ briefText: BRIEF }),
});
const json = await res.json();
if (!res.ok) { console.error("Sharpen failed:", json.error || res.status); process.exit(1); }

const groups = json.deliveryPlan?.deliverableGroups || [];
console.log("Title:    ", json.title);
console.log("Plan:     ", JSON.stringify(groups, null, 2));
console.log("Derived:  ", json.proposedSpecialists);

const VISUAL = new Set(["a19","a20","a21","a22","a35","a41","a42","a43","a44","a45","a46"]);
const hasGroups   = groups.length > 0;
const hasVisual   = groups.some((g) => Object.values(g.crew || {}).some((id) => VISUAL.has(id)));
const hasPlatform = groups.every((g) => Array.isArray(g.platforms) && g.platforms.length > 0);

console.log("\nChecks:");
console.log("  has groups:   ", hasGroups);
console.log("  has visual:   ", hasVisual, "(social brief MUST propose a visual specialist)");
console.log("  has platforms:", hasPlatform);

if (hasGroups && hasVisual && hasPlatform) { console.log("\n✅ Delivery Plan contract OK"); process.exit(0); }
console.error("\n❌ Delivery Plan contract FAILED"); process.exit(1);
```

- [ ] **Step 2: Add npm scripts**

In `package.json` `scripts`, add:

```json
    "test:plan": "node --env-file=server/.env scripts/test-delivery-plan.mjs",
    "test:units": "node --test server/src/lib/"
```

- [ ] **Step 3: Run the unit suite together**

Run: `npm run test:units`
Expected: all three `.test.mjs` files pass (platforms, taxonomy, delivery-plan).

- [ ] **Step 4: Run the live smoke (servers up on :8787)**

Run: `EMAIL=<dev email> PASSWORD=<dev pw> npm run test:plan`
Expected: prints the plan, then `✅ Delivery Plan contract OK`. For the default social brief the plan should contain a `social_post` group with a visual crew id (a41) and `["instagram","linkedin"]` platforms.

- [ ] **Step 5: Commit**

```bash
git add scripts/test-delivery-plan.mjs package.json
git commit -m "test(canvas): add Delivery Plan unit + live smoke scripts"
```

---

## Self-Review

**Spec coverage (this plan = Phase 1 only):**
- §4.1 Delivery Plan shape → Task 4 (Sharpener emits `deliveryPlan`); normalized by Task 3. ✅
- §4.1a Platform inquiry (infer/ask/assumed) → Task 4 prompt rules (infer + ask-when-ambiguous). The structured `platformInquiry.status` field is consumed in the UX plan; here the prompt produces platforms + an optional question. ✅ (status enum deferred to Plan 3 — noted below.)
- §4.2 Taxonomy → Task 2. ✅
- §4.3a Platform spec table → Task 1. ✅
- §4.5 credit estimate → `estimateCr` built in Task 3; **surfaced** to the user in Plan 3 (needs CI_AGENTS cr in the client). ✅ (pure helper here, UI later.)
- §6 Back-compat → `wrapLegacy` + derived `proposedSpecialists` (Task 3/4); current client untouched. ✅
- §4.3 structured specialist output, §4.4 canvas fan-out, §4.6 routing re-tune → **out of scope for Plan 1** (Plans 2–4). Listed in roadmap.

**Placeholder scan:** none — every step has real code/commands. `estimateCr` returning `null` without a cr lookup is intentional, not a stub.

**Type consistency:** `normalizePlan` returns `{ deliverableGroups, proposedSpecialists }` — consumed verbatim in Task 4's parse and the smoke script. `typeSpec`/`isType`/`platformSpec`/`isPlatform` names match across Tasks 1–4. Crew ids in `taxonomy.js` are all `aNN` and guarded by the Task 2 test.

---

## Roadmap — the remaining plans (write after Plan 1 verifies)

- **Plan 2 — Run engine.** `server/src/routes/runs.js` + `compose-specialist-prompt.js` + `compose-image-prompt.js`: consume the Delivery Plan; structured multi-deliverable output (one copy call → N items); **fix `maxTokens` to size by count/type** (the 300-token truncation, `runs.js:255`); one image gen per slot×platform at platform dims; **QA per deliverable**; persist `deliverables` JSON array on the output row. Verifiable via a `.mjs` smoke that asserts N deliverables come back QA'd.
- **Plan 3 — Canvas fan-out (client).** `portal-briefs.jsx`: `deliverable` node kind, `buildInitialRunNodes` fan-out to `count × platforms`, composite card render (image+caption / hero+body), per-card select/edit/export/re-run-one, "Export selected", `BriefViewCanvas` hydrate from the stored array, mirrored client taxonomy/platform constants. Keep `CanvasHeader`, route clicks via `onNodeClick`.
- **Plan 4 — Orchestration UX + routing.** `portal-brandolph.jsx`: consume `deliveryPlan`, remove `.slice(0,3)`, review step shows per-group count + platform chips + **credit estimate** (via `estimateCr` + CI_AGENTS cr) with adjust controls + `platformInquiry.status`; then the model-routing re-tune for flagged creative specialists (`portal-data.js`), verified against `brand_specialist_stats`.

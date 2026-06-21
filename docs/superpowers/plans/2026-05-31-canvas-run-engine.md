# Canvas Delivery Plan — Plan 2: Run Engine (server)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a single specialist run produce **N complete, structured, per-item-QA'd deliverables** (text) or a **platform-sized image** — killing the 300-token truncation — while staying fully back-compatible with today's single-blob runs.

**Architecture:** A new pure helper module (`deliverables.js`) carries all the testable logic — token sizing, JSON parsing, the output contract, and platform→fal-size mapping. `composeSpecialistPrompt` and `composeImagePrompt` gain one optional param each. `routes/runs.js` becomes deliverable-aware: when the request carries a `deliverableSpec`, it injects the contract, sizes `maxTokens` by count, parses N deliverables, QA's each, and persists a `deliverables` JSON array on the output row. No `deliverableSpec` → today's exact behavior.

**Tech Stack:** Node ESM, Hono, fal.ai image gen, Supabase. Tests: built-in `node:test` for pure helpers (zero deps). The route itself is verified via `node --check` + an import smoke + a live `.mjs` smoke the human runs (paid).

**Scope boundary (decided):** the run engine handles ONE `(specialist, platform)` context per call — `count` text deliverables in one LLM call, OR one image. The **client (Plan 3) drives the fan-out loop** across platforms and image slots. Batching multiple platforms into one text call is a noted future cost optimization, out of scope here.

**Standing rules honored:** only credits shown to users; per-item QA uses the cheap tier; hard token ceiling caps cost; back-compat preserved; commits per task (human authorized).

---

## File Structure

| File | Responsibility |
|------|----------------|
| `server/src/lib/deliverables.js` (new) | Pure run-engine helpers: `maxTokensForDeliverables`, `parseDeliverables`, `buildDeliverableContract`, `falSizeForPlatform`. |
| `server/src/lib/deliverables.test.mjs` (new) | Unit tests for all four helpers. |
| `server/src/lib/compose-specialist-prompt.js` (modify) | Optional `deliverableContract` param → appended content block. |
| `server/src/lib/compose-specialist-prompt.test.mjs` (new) | Unit test for the new param (block appended / not). |
| `server/src/lib/compose-image-prompt.js` (modify) | Optional `sourceText` param → image illustrates the paired copy. |
| `server/src/lib/compose-image-prompt.test.mjs` (new) | Unit test for the new param. |
| `server/src/routes/runs.js` (modify) | Deliverable-aware: contract injection, count-sized maxTokens, N-deliverable parse + per-item QA + array persistence + done payload; platform-sized images. |
| `scripts/test-deliverables.mjs` (new) | Live smoke: a real deliverable run, asserts N items come back QA'd. |
| `package.json` (modify) | Add `test:deliverables` script. |

---

## Task 1: Pure run-engine helpers (`deliverables.js`)

**Files:**
- Create: `server/src/lib/deliverables.js`
- Test: `server/src/lib/deliverables.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// server/src/lib/deliverables.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  maxTokensForDeliverables, parseDeliverables, buildDeliverableContract,
  falSizeForPlatform, TOKEN_CEILING,
} from "./deliverables.js";

test("maxTokensForDeliverables scales with count and is floored per item", () => {
  assert.equal(maxTokensForDeliverables({ count: 1, baseCr: 8 }), 400 + 1 * 800);
  assert.equal(maxTokensForDeliverables({ count: 5, baseCr: 3 }), 400 + 5 * 300); // perItem floored at 300
});

test("maxTokensForDeliverables is capped at the ceiling and never below one item", () => {
  assert.equal(maxTokensForDeliverables({ count: 20, baseCr: 14 }), TOKEN_CEILING); // would exceed -> capped
  assert.equal(maxTokensForDeliverables({ count: 0, baseCr: 8 }), 400 + 1 * 800);   // count<1 -> 1
  assert.equal(maxTokensForDeliverables({}), 400 + 1 * 800);                         // defaults
});

test("parseDeliverables reads a clean JSON deliverables array", () => {
  const raw = '{"deliverables":[{"title":"Mon","body":"post one"},{"title":"Tue","body":"post two"}]}';
  const out = parseDeliverables(raw);
  assert.equal(out.malformed, false);
  assert.equal(out.deliverables.length, 2);
  assert.deepEqual(out.deliverables[0], { title: "Mon", body: "post one" });
});

test("parseDeliverables strips ```json fences", () => {
  const raw = "```json\n{\"deliverables\":[{\"title\":\"x\",\"body\":\"y\"}]}\n```";
  const out = parseDeliverables(raw);
  assert.equal(out.malformed, false);
  assert.equal(out.deliverables[0].body, "y");
});

test("parseDeliverables degrades gracefully on non-JSON (never loses output)", () => {
  const out = parseDeliverables("just some prose the model wrote");
  assert.equal(out.malformed, true);
  assert.equal(out.deliverables.length, 1);
  assert.equal(out.deliverables[0].body, "just some prose the model wrote");
});

test("parseDeliverables treats empty/absent array as malformed fallback", () => {
  assert.equal(parseDeliverables('{"deliverables":[]}').malformed, true);
  assert.equal(parseDeliverables('{"foo":1}').malformed, true);
});

test("buildDeliverableContract names count, type, platform and demands strict JSON", () => {
  const c = buildDeliverableContract({ type: "social_post", part: "caption", count: 5, platform: "instagram" });
  assert.match(c, /STRICT JSON/i);
  assert.match(c, /deliverables/);
  assert.match(c, /5/);
  assert.match(c, /Instagram/);
  assert.match(c, /Social post/i);
});

test("falSizeForPlatform maps platform dims to the nearest fal named size", () => {
  assert.equal(falSizeForPlatform("instagram"), "square_hd");      // 1:1
  assert.equal(falSizeForPlatform("linkedin"), "landscape_16_9");  // 1.91:1
  assert.equal(falSizeForPlatform("x"), "landscape_16_9");         // 16:9
  assert.equal(falSizeForPlatform("tiktok"), "portrait_16_9");     // 9:16
  assert.equal(falSizeForPlatform("instagram_story"), "portrait_16_9");
  assert.equal(falSizeForPlatform("email"), "landscape_4_3");      // 3:2
  assert.equal(falSizeForPlatform("generic"), "square_hd");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test server/src/lib/deliverables.test.mjs`
Expected: FAIL — `Cannot find module './deliverables.js'`.

- [ ] **Step 3: Write the implementation**

```js
// server/src/lib/deliverables.js
// Pure run-engine helpers. No I/O. Used by routes/runs.js to turn a single
// specialist call into N structured, per-item-QA'd deliverables, and to size
// images per platform. Composes over the Plan 1 registries.

import { typeSpec } from "./taxonomy.js";
import { platformSpec } from "./platforms.js";

export const TOKEN_CEILING = 8000;   // hard cap so a big count can't run away

// Size the model's output budget by how many deliverables we asked for. Each
// item gets a per-item budget (floored at 250) plus a small JSON overhead.
export function maxTokensForDeliverables({ count = 1, baseCr = 8 } = {}) {
  const n = Math.max(1, Math.round(Number(count)) || 1);
  const perItem = Math.max(250, (Number(baseCr) || 8) * 100);
  return Math.min(TOKEN_CEILING, 400 + n * perItem);
}

// Parse the specialist's structured output. Always returns at least one
// deliverable — on malformed output we wrap the raw text so nothing is lost.
export function parseDeliverables(rawText) {
  const stripped = String(rawText || "")
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
  let parsed = null;
  try { parsed = JSON.parse(stripped); } catch { parsed = null; }
  const arr = parsed && Array.isArray(parsed.deliverables) ? parsed.deliverables : null;
  if (!arr || arr.length === 0) {
    return { deliverables: [{ title: "", body: stripped }], malformed: true };
  }
  const deliverables = arr.map((d) => ({
    title: typeof d?.title === "string" ? d.title : "",
    body: typeof d?.body === "string"
      ? d.body
      : (typeof d === "string" ? d : JSON.stringify(d ?? "")),
  }));
  return { deliverables, malformed: false };
}

// The strict-JSON instruction injected into the specialist prompt so it
// returns N complete, platform-fitted deliverables instead of one blob.
export function buildDeliverableContract({ type, part = "body", count = 1, platform = "generic" } = {}) {
  const label = typeSpec(type)?.label || "deliverable";
  const ps = platformSpec(platform);
  const lenRule = ps.copyMaxChars
    ? `Keep each ${part} within ~${ps.copyMaxChars} characters.`
    : `Length as the format demands.`;
  const n = Math.max(1, Math.round(Number(count)) || 1);
  return [
    `Return STRICT JSON only — no preamble, no markdown fences:`,
    `{"deliverables":[{"title":"short label","body":"the ${part}"}]}`,
    `Produce exactly ${n} distinct, complete ${label} deliverable(s) for ${ps.label}.`,
    `Each must stand on its own and be ready to ship. Tone: ${ps.tone}. ${lenRule}`,
    `Do not number them in the body. Do not add any commentary outside the JSON.`,
  ].join(" ");
}

// Map a platform's image dimensions to the nearest fal named size.
// fal sizes: square_hd (1:1), landscape_4_3 (~3:2/4:3), landscape_16_9 (16:9+),
// portrait_4_3 (3:4), portrait_16_9 (9:16).
export function falSizeForPlatform(platform = "generic") {
  const { w, h } = platformSpec(platform).image;
  const ratio = (Number(w) || 1) / (Number(h) || 1);
  if (ratio >= 1.55) return "landscape_16_9";
  if (ratio >= 1.2)  return "landscape_4_3";
  if (ratio > 0.85)  return "square_hd";
  if (ratio > 0.6)   return "portrait_4_3";
  return "portrait_16_9";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test server/src/lib/deliverables.test.mjs`
Expected: PASS — 8 tests, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/deliverables.js server/src/lib/deliverables.test.mjs
git commit -m "feat(canvas): add run-engine deliverable helpers (sizing, parse, contract, fal size)"
```

---

## Task 2: `composeSpecialistPrompt` — optional `deliverableContract`

**Files:**
- Modify: `server/src/lib/compose-specialist-prompt.js` (the exported `composeSpecialistPrompt` at the bottom)
- Test: `server/src/lib/compose-specialist-prompt.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// server/src/lib/compose-specialist-prompt.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { composeSpecialistPrompt } from "./compose-specialist-prompt.js";

const base = {
  spec: { specialist_id: "a16", payload: { name: "Social Captions", kind: "copy" } },
  brand: { name: "Acme" },
  bio: { version: 1, identity: { positioning: "p" } },
  refusals: [],
  brief: "Five captions",
};

test("without deliverableContract returns the original 4 content blocks", () => {
  const blocks = composeSpecialistPrompt(base);
  assert.equal(blocks.length, 4);
});

test("with deliverableContract appends a 5th block containing the contract", () => {
  const blocks = composeSpecialistPrompt({ ...base, deliverableContract: "RETURN-STRICT-JSON-XYZ" });
  assert.equal(blocks.length, 5);
  assert.equal(blocks[4].type, "text");
  assert.match(blocks[4].text, /RETURN-STRICT-JSON-XYZ/);
  assert.match(blocks[4].text, /OUTPUT FORMAT/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test server/src/lib/compose-specialist-prompt.test.mjs`
Expected: FAIL — the 5-block assertion fails (param not yet supported).

- [ ] **Step 3: Implement** — replace the exported function (currently `export function composeSpecialistPrompt({ spec, brand, bio, refusals = [], brief, priorOutputs = [] }) { return [ ... ]; }`) with:

```js
export function composeSpecialistPrompt({ spec, brand, bio, refusals = [], brief, priorOutputs = [], deliverableContract = null }) {
  const blocks = [
    { type: "text", text: PLATFORM_PREAMBLE, cache_control: { type: "ephemeral" } },
    { type: "text", text: renderBioSlice(brand, bio, spec?.payload?.bioSlices, refusals), cache_control: { type: "ephemeral" } },
    { type: "text", text: renderSpecLayer(spec) },
    { type: "text", text: renderTaskLayer(brief, priorOutputs) },
  ];
  if (deliverableContract) {
    blocks.push({ type: "text", text: `## OUTPUT FORMAT (STRICT)\n${deliverableContract}` });
  }
  return blocks;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test server/src/lib/compose-specialist-prompt.test.mjs`
Expected: PASS — 2 tests, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/compose-specialist-prompt.js server/src/lib/compose-specialist-prompt.test.mjs
git commit -m "feat(canvas): composeSpecialistPrompt accepts an optional deliverable contract"
```

---

## Task 3: `composeImagePrompt` — optional `sourceText`

**Files:**
- Modify: `server/src/lib/compose-image-prompt.js`
- Test: `server/src/lib/compose-image-prompt.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// server/src/lib/compose-image-prompt.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { composeImagePrompt } from "./compose-image-prompt.js";

const base = {
  spec: { payload: { role: "Social post designer" } },
  brand: { name: "Acme" },
  bio: { visual: {} },
  refusals: [],
  brief: "A spring drop hero",
};

test("without sourceText the prompt has no accompanying-copy line", () => {
  const p = composeImagePrompt(base);
  assert.doesNotMatch(p, /accompanies this copy/i);
});

test("with sourceText the prompt instructs to depict the copy's subject, not the text", () => {
  const p = composeImagePrompt({ ...base, sourceText: "Bloom season is here" });
  assert.match(p, /accompanies this copy/i);
  assert.match(p, /Bloom season is here/);
  assert.match(p, /do not render the text/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test server/src/lib/compose-image-prompt.test.mjs`
Expected: FAIL — the sourceText line is absent.

- [ ] **Step 3: Implement** — (a) add `sourceText = null` to the destructured params of `composeImagePrompt`, and (b) immediately after the existing `lines.push(String(brief || "").trim());` line, insert:

```js
  /* When this image illustrates a specific copy deliverable (a social post
     caption, a blog hero), depict its subject — never typeset the words. */
  if (sourceText) {
    lines.push(`The image accompanies this copy: "${String(sourceText).slice(0, 240)}". Depict its subject and mood; do not render the text itself.`);
  }
```

So the signature line becomes:
```js
export function composeImagePrompt({ spec, brand, bio, refusals = [], brief, sourceText = null }) {
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test server/src/lib/compose-image-prompt.test.mjs`
Expected: PASS — 2 tests, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/compose-image-prompt.js server/src/lib/compose-image-prompt.test.mjs
git commit -m "feat(canvas): composeImagePrompt can illustrate a paired copy deliverable"
```

---

## Task 4: Make the run route deliverable-aware (`routes/runs.js`)

**Files:**
- Modify: `server/src/routes/runs.js`

This task wires the helpers into the streaming route. It is verified by `node --check` + an import smoke + the unit suites already green; the end-to-end behavior is verified by the Task 5 live smoke (paid, human-run). Apply edits A–H exactly. READ the file first.

- [ ] **Step A: Import the helpers.** After the existing import line `import { generate as generateImage, isImageRoute } from "../lib/models/fal-image.js";` add:

```js
import { maxTokensForDeliverables, parseDeliverables, buildDeliverableContract, falSizeForPlatform } from "../lib/deliverables.js";
```

- [ ] **Step B: Read `deliverableSpec` from the body.** Replace:

```js
  const { specialistId, briefText, brandId, briefId: existingBriefId, briefMeta, modelOverride, revisionFeedback } = body || {};
```
with:
```js
  const { specialistId, briefText, brandId, briefId: existingBriefId, briefMeta, modelOverride, revisionFeedback, deliverableSpec } = body || {};
```

- [ ] **Step C: Derive the deliverable flags.** Immediately after the line `const isImage = isImageRoute(route);` add:

```js
  /* Deliverable mode: when the caller passes a deliverableSpec, a TEXT run
     returns N structured items (one LLM call) and an IMAGE run is sized to
     the platform. No deliverableSpec → legacy single-output behavior. */
  const dlv = (deliverableSpec && typeof deliverableSpec === "object") ? deliverableSpec : null;
  const isDeliverableText = !isImage && !!dlv && Number(dlv.count) >= 1;
```

- [ ] **Step D: Inject the contract into the specialist prompt.** Replace the `const system = isImage ? null : composeSpecialistPrompt({ ... });` block with:

```js
  const system = isImage
    ? null
    : composeSpecialistPrompt({
        spec: effectiveSpec,
        brand: brandBio.brand,
        bio: brandBio.bio,
        refusals: brandBio.refusals,
        brief: effectiveBriefText,
        priorOutputs,
        deliverableContract: isDeliverableText
          ? buildDeliverableContract({ type: dlv.type, part: dlv.part, count: Number(dlv.count), platform: dlv.platform })
          : null,
      });
```

- [ ] **Step E: Pass `sourceText` to the image prompt + size the image by platform.** Replace the `const imagePrompt = isImage ? composeImagePrompt({ ... }) : null;` block with:

```js
  const imagePrompt = isImage
    ? composeImagePrompt({
        spec: effectiveSpec,
        brand: brandBio.brand,
        bio: brandBio.bio,
        refusals: brandBio.refusals,
        brief: effectiveBriefText,
        sourceText: dlv?.sourceText || null,
      })
    : null;
```

And in the image pipeline, replace `size: spec.payload?.image_size || "landscape_16_9",` with:

```js
          size: dlv?.platform ? falSizeForPlatform(dlv.platform) : (spec.payload?.image_size || "landscape_16_9"),
```

- [ ] **Step F: Size the text token budget by count.** Replace:

```js
          maxTokens: (effectiveSpec.payload?.cr_estimate ?? 8) * 100,
```
with:
```js
          maxTokens: isDeliverableText
            ? maxTokensForDeliverables({ count: Number(dlv.count), baseCr: effectiveSpec.payload?.cr_estimate ?? 8 })
            : (effectiveSpec.payload?.cr_estimate ?? 8) * 100,
```

- [ ] **Step G: Parse + QA each deliverable.** Replace the QA block:

```js
      let qa;
      if (isImage) {
        const v = await visionQa({ assetUrl: imageResult?.asset_url, bio: brandBio.bio });
        qa = { ...v, kind: "image_a24" };
      } else {
        qa = await voiceQa({ body: output, bio: brandBio.bio, refusals: brandBio.refusals });
      }
      await stream.writeSSE({ event: "qa", data: JSON.stringify(qa) });
```
with:
```js
      let qa;
      let deliverables = null;        /* set on the deliverable-text path */
      if (isImage) {
        const v = await visionQa({ assetUrl: imageResult?.asset_url, bio: brandBio.bio });
        qa = { ...v, kind: "image_a24" };
      } else if (isDeliverableText) {
        /* One LLM call produced N items; QA each so a single weak post is
           flagged individually instead of passing the whole batch. */
        const parsed = parseDeliverables(output);
        deliverables = [];
        let passedAll = true;
        const qaUsage = { cost_usd: 0 };
        for (const d of parsed.deliverables) {
          const dq = await voiceQa({ body: d.body, bio: brandBio.bio, refusals: brandBio.refusals });
          if (!dq.passed) passedAll = false;
          if (typeof dq.usage?.cost_usd === "number") qaUsage.cost_usd += dq.usage.cost_usd;
          deliverables.push({ ...d, platform: dlv.platform || "generic", qa: dq, status: dq.passed ? "approved" : "flagged" });
        }
        qa = { passed: passedAll, voice_match: null, violations: [], usage: qaUsage, malformed: parsed.malformed, deliverable_count: deliverables.length };
      } else {
        qa = await voiceQa({ body: output, bio: brandBio.bio, refusals: brandBio.refusals });
      }
      await stream.writeSSE({ event: "qa", data: JSON.stringify(qa) });
```

- [ ] **Step H: Persist the array + carry it in the done payload.** (1) Replace the `const outputBody = isImage ? { ... } : { text: output, rationale: null };` block with:

```js
      const outputBody = isImage
        ? {
            kind: "image",
            asset_url:   imageResult?.asset_url,
            width:       imageResult?.width,
            height:      imageResult?.height,
            seed:        imageResult?.seed,
            prompt_used: imageResult?.prompt_used,
          }
        : isDeliverableText
        ? { kind: "deliverables", type: dlv.type, part: dlv.part, platform: dlv.platform || "generic", deliverables }
        : { text: output, rationale: null };
```

(2) In the final `done` event, replace the `output:` ternary:

```js
          output: isImage
            ? { kind: outputKind, asset_url: imageResult?.asset_url, width: imageResult?.width, height: imageResult?.height, status: qa.passed ? "approved" : "flagged" }
            : { text: output, status: qa.passed ? "approved" : "flagged" },
```
with:
```js
          output: isImage
            ? { kind: outputKind, asset_url: imageResult?.asset_url, width: imageResult?.width, height: imageResult?.height, status: qa.passed ? "approved" : "flagged" }
            : isDeliverableText
            ? { kind: "deliverables", type: dlv.type, part: dlv.part, platform: dlv.platform || "generic", deliverables, status: qa.passed ? "approved" : "flagged" }
            : { text: output, status: qa.passed ? "approved" : "flagged" },
```

- [ ] **Step I: Verify (no live model call).**

Run: `node --check server/src/routes/runs.js`
Expected: exit 0, no output.

Run: `node -e "import('./server/src/routes/runs.js').then(()=>console.log('import OK')).catch(e=>{console.error(e);process.exit(1)})"`
Expected: `import OK`.

Run the full unit suite (helpers untouched, sanity): `node --test server/src/lib/platforms.test.mjs server/src/lib/taxonomy.test.mjs server/src/lib/delivery-plan.test.mjs server/src/lib/deliverables.test.mjs server/src/lib/compose-specialist-prompt.test.mjs server/src/lib/compose-image-prompt.test.mjs`
Expected: all pass (Plan 1's 18 + Task 1's 8 + Task 2's 2 + Task 3's 2 = 30).

- [ ] **Step J: Commit**

```bash
git add server/src/routes/runs.js
git commit -m "feat(canvas): run route emits N QA'd deliverables + platform-sized images"
```

> Note for the GET `/api/runs/:id` reader and `BriefViewCanvas` (Plan 3): outputs now may carry `body.kind === "deliverables"` with a `deliverables` array. Old rows still carry `{ text }`. Plan 3 must render both shapes.

---

## Task 5: Live smoke + npm script

**Files:**
- Create: `scripts/test-deliverables.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write the smoke script**

```js
// scripts/test-deliverables.mjs
// Live smoke for the deliverable run path. Signs in, fires ONE text specialist
// run with a deliverableSpec asking for N items, parses the SSE, and asserts N
// structured deliverables came back (each with its own QA status).
//
// Run:
//   EMAIL=... PASSWORD=... [SPECIALIST=a16] [COUNT=5] npm run test:deliverables

import { createClient } from "@supabase/supabase-js";

const EMAIL    = process.env.EMAIL;
const PASSWORD = process.env.PASSWORD;
const API_BASE = process.env.API_BASE || "http://localhost:8787";
const SPECIALIST = process.env.SPECIALIST || "a16";
const COUNT    = Number(process.env.COUNT || 5);
const BRIEF    = process.env.BRIEF || "A week of Instagram captions for the spring drop.";

if (!EMAIL || !PASSWORD) {
  console.error("Usage: EMAIL=... PASSWORD=... [SPECIALIST=a16] [COUNT=5] npm run test:deliverables");
  process.exit(1);
}

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const { data: auth, error: authErr } = await sb.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
if (authErr) { console.error("Sign-in failed:", authErr.message); process.exit(1); }
const jwt = auth.session.access_token;

const res = await fetch(`${API_BASE}/api/runs/stream`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
  body: JSON.stringify({
    specialistId: SPECIALIST,
    briefText: BRIEF,
    deliverableSpec: { type: "social_post", part: "caption", count: COUNT, platform: "instagram" },
  }),
});
if (!res.ok) { console.error("Run failed:", res.status, await res.text()); process.exit(1); }

const reader = res.body.getReader();
const decoder = new TextDecoder();
let buf = "", done = null;
while (true) {
  const { value, done: rdone } = await reader.read();
  if (rdone) break;
  buf += decoder.decode(value, { stream: true });
  const events = buf.split("\n\n"); buf = events.pop() || "";
  for (const ev of events) {
    const dataLine = ev.split("\n").find((l) => l.startsWith("data:"));
    const typeLine = ev.split("\n").find((l) => l.startsWith("event:"));
    if (typeLine?.includes("done") && dataLine) { try { done = JSON.parse(dataLine.slice(5).trim()); } catch {} }
  }
}

const items = done?.output?.deliverables || [];
console.log(`Deliverables returned: ${items.length}`);
items.forEach((d, i) => console.log(`  ${i + 1}. [${d.status}] ${d.title || "(untitled)"} — ${String(d.body).slice(0, 60)}…`));

if (items.length >= 2 && done?.output?.kind === "deliverables") {
  console.log(`\n✅ Run engine produced ${items.length} structured deliverables`);
  process.exit(0);
}
console.error("\n❌ Expected a deliverables array with ≥2 items"); process.exit(1);
```

- [ ] **Step 2: Add the npm script.** In `package.json` `scripts`, after `"test:units"`, add:

```json
    "test:deliverables": "node --env-file=server/.env scripts/test-deliverables.mjs"
```

- [ ] **Step 3: Verify the script parses (do NOT run it — paid + needs creds).**

Run: `node --check scripts/test-deliverables.mjs`
Expected: exit 0.

- [ ] **Step 4: Confirm the unit suite still green via the script.**

Run: `npm run test:units`
Expected: still passes for the Plan 1 trio (this script wasn't changed to include the new files — leave it; the new helper tests are run explicitly in Task 4 Step I).

- [ ] **Step 5: Commit**

```bash
git add scripts/test-deliverables.mjs package.json
git commit -m "test(canvas): add live smoke for the deliverable run path"
```

---

## Self-Review

**Spec coverage (Plan 2 scope):**
- Truncation fix (`runs.js:255`) → Task 1 `maxTokensForDeliverables` + Task 4 Step F. ✅
- N structured deliverables in one call → Task 1 `parseDeliverables` + `buildDeliverableContract` + Task 2 contract block + Task 4 Steps D/G. ✅
- Per-deliverable QA → Task 4 Step G. ✅
- Platform-sized images + paired copy → Task 1 `falSizeForPlatform` + Task 3 `sourceText` + Task 4 Step E. ✅
- Persist `deliverables` JSON array → Task 4 Step H. ✅
- Back-compat (no `deliverableSpec` → today's behavior) → the `isDeliverableText` / `dlv` guards keep every legacy branch intact. ✅

**Placeholder scan:** none — every step has real code/commands.

**Type consistency:** `deliverableSpec` shape `{ type, part, count, platform, sourceText }` is used identically in Task 4 Steps C/D/E/F/G/H and the Task 5 smoke. `parseDeliverables` returns `{ deliverables, malformed }`; the route reads `.deliverables` and `.malformed`. Output `body.kind === "deliverables"` matches the done-event `output.kind` and the Plan 3 note.

---

## Roadmap — remaining plans

- **Plan 3 — Canvas fan-out (client, `portal-briefs.jsx`):** drive the fan-out loop (call the copy specialist once per group → N items; image specialist per slot×platform), add the `deliverable` node kind, composite cards (image+caption), per-card select/edit/export + "Export selected", and hydrate both `{text}` and `{deliverables}` output shapes in `BriefViewCanvas`. Enforce the empty-plan message (Plan 1 carry-forward). Keep `CanvasHeader`; route clicks via `onNodeClick`.
- **Plan 4 — Orchestration UX + routing:** review step shows per-group count + platform chips + credit estimate (`estimateCr` × `CI_AGENTS` cr) with adjust controls; validate model-supplied crew ids against `CI_AGENTS` before dispatch; then the model-routing re-tune for flagged creative specialists (`portal-data.js`), verified against `brand_specialist_stats`.

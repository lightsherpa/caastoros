# Image Quality Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire GPT Image 2 (via fal) behind a no-risk benchmark, make the Ad Creative image share one art direction with its paired copy, and turn The Mood Board into a real structured board (palette + type + keywords + imagery tiles).

**Architecture:** Three workstreams over the existing pipeline. (1) A new `vendor/fal/gpt-image-2` route + an offline benchmark script — no live routing change. (2) Copy deliverables gain a structured `visualDirection` field that is threaded into the image prompt as dominant art direction. (3) The Mood Board specialist fans out into N imagery tiles which a new client-side `MoodBoardCard` composes with BIO palette/type/keywords.

**Tech Stack:** Node + Hono (server), `node:test` (server unit tests), React 18 + Vite (SPA, no test runner — verified by running), fal.ai queue API, Supabase.

**Standing constraints (from CLAUDE.md):** Never call the project anything but CaastorOS. Don't change run/SSE flow or remove CanvasHeader. Wire canvas node clicks via `onNodeClick`. Keep image volume slots on Schnell; gpt-image-2 only in the benchmark. User sees credits, never raw cost.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `server/src/lib/models/fal-image.js` | fal route table + generator | Modify: export `FAL_ROUTES`, add `vendor/fal/gpt-image-2` |
| `server/src/lib/models/fal-image.test.mjs` | Unit test the route config (no network) | Create |
| `scripts/seed-specs.mjs` | short-key → route map | Modify: `gptimage` → gpt-image-2 |
| `scripts/bench-image.mjs` | Offline Flux vs gpt-image-2 benchmark | Create |
| `server/src/lib/compose-image-prompt.js` | Build the single image prompt | Modify: honour `artDirection` |
| `server/src/lib/compose-image-prompt.test.mjs` | Composer unit tests | Modify: add `artDirection` cases |
| `server/src/lib/deliverables.js` | Deliverable contract + parsing | Modify: optional `visualDirection` field |
| `server/src/lib/deliverables.test.mjs` | Deliverable helper tests | Modify: add `visualDirection` cases |
| `server/src/routes/runs.js` | Run orchestration | Modify: forward `withVisualDirection` + `artDirection`; mood-board `bio_visual` in done |
| `src/portal-data.js` | Specialist specs | Modify: `a12`/`a38` visualDirection; `a35` mood-board spec |
| `src/portal-briefs.jsx` | Canvas run + render | Modify: pairing passes art direction; mood-board fan-out; new `MoodBoardCard` |

---

## Workstream 1 — GPT Image 2 route + benchmark

### Task 1: Add the `vendor/fal/gpt-image-2` fal route

**Files:**
- Modify: `server/src/lib/models/fal-image.js` (the `FAL_ROUTES` object, ~line 22)
- Test: `server/src/lib/models/fal-image.test.mjs` (create)

- [ ] **Step 1: Export `FAL_ROUTES` so it can be unit-tested**

In `server/src/lib/models/fal-image.js`, change the declaration:

```js
const FAL_ROUTES = {
```
to:
```js
export const FAL_ROUTES = {
```

- [ ] **Step 2: Add the gpt-image-2 entry**

Inside `FAL_ROUTES`, after the `"vendor/fal/recraft-v3"` block, add:

```js
  "vendor/fal/gpt-image-2": {
    endpoint: "/openai/gpt-image-2",
    payload: ({ prompt, size = "landscape_16_9" }) => ({
      prompt,
      image_size: size,
      quality: "high",
      num_images: 1,
      output_format: "png",
    }),
    cost_estimate_usd: 0.07,   // token-priced model; placeholder until real numbers land
  },
```

- [ ] **Step 3: Write the failing test**

Create `server/src/lib/models/fal-image.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { FAL_ROUTES, isImageRoute } from "./fal-image.js";

test("gpt-image-2 route is registered with the correct fal endpoint", () => {
  const r = FAL_ROUTES["vendor/fal/gpt-image-2"];
  assert.ok(r, "vendor/fal/gpt-image-2 must exist in FAL_ROUTES");
  assert.equal(r.endpoint, "/openai/gpt-image-2");
});

test("gpt-image-2 payload builds the documented fal params", () => {
  const r = FAL_ROUTES["vendor/fal/gpt-image-2"];
  const body = r.payload({ prompt: "a cold brew on stone", size: "square_hd" });
  assert.equal(body.prompt, "a cold brew on stone");
  assert.equal(body.image_size, "square_hd");
  assert.equal(body.quality, "high");
  assert.equal(body.num_images, 1);
  assert.equal(body.output_format, "png");
});

test("gpt-image-2 payload defaults size to landscape_16_9", () => {
  const body = FAL_ROUTES["vendor/fal/gpt-image-2"].payload({ prompt: "x" });
  assert.equal(body.image_size, "landscape_16_9");
});

test("isImageRoute recognizes the gpt-image-2 route", () => {
  assert.equal(isImageRoute("vendor/fal/gpt-image-2"), true);
});
```

- [ ] **Step 4: Run the test**

Run: `node --test server/src/lib/models/fal-image.test.mjs`
Expected: 4 tests pass.

- [ ] **Step 5: Add the test file to the `test:units` script**

In root `package.json`, append `server/src/lib/models/fal-image.test.mjs` to the `test:units` command's file list.

- [ ] **Step 6: Commit**

```bash
git add server/src/lib/models/fal-image.js server/src/lib/models/fal-image.test.mjs package.json
git commit -m "feat: add vendor/fal/gpt-image-2 image route"
```

---

### Task 2: Remap the `gptimage` short key

**Files:**
- Modify: `scripts/seed-specs.mjs` (`MODEL_MAP`, ~line 82)

- [ ] **Step 1: Repoint the alias**

In `scripts/seed-specs.mjs`, change:

```js
  gptimage:    "vendor/fal/flux-1.1-pro",     /* was gpt-image-1; switched per cost+quality memo */
```
to:
```js
  gptimage:    "vendor/fal/gpt-image-2",      /* real GPT Image 2 via fal (openai/gpt-image-2) */
```

- [ ] **Step 2: Do NOT reseed specs**

No `npm run seed:specs` here. Live routing stays on Flux until the benchmark picks winners (a later, separate step). This edit only changes what a future reseed would write.

- [ ] **Step 3: Commit**

```bash
git add scripts/seed-specs.mjs
git commit -m "chore: point gptimage short key at real gpt-image-2 route"
```

---

### Task 3: Offline benchmark script (Flux Pro vs gpt-image-2)

**Files:**
- Create: `scripts/bench-image.mjs`

Runs the **same composed prompt** through `vendor/fal/flux-1.1-pro` and `vendor/fal/gpt-image-2` for three slots, against the **BIO currently in the DB**, and saves the images side-by-side. No live spec change.

- [ ] **Step 1: Write the benchmark script**

Create `scripts/bench-image.mjs`:

```js
// Offline image benchmark — Flux 1.1 Pro vs GPT Image 2 on the same prompt.
// Uses the brand BIO currently in the DB (first brand). Saves images +
// a results.md to docs/benchmarks/<date>/. Live routing is NOT touched.
//
// Run:  node --env-file=server/.env scripts/bench-image.mjs
import { createClient } from "@supabase/supabase-js";
import { writeFileSync, mkdirSync } from "node:fs";
import { generate } from "../server/src/lib/models/fal-image.js";
import { composeImagePrompt } from "../server/src/lib/compose-image-prompt.js";

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY"); process.exit(1);
}
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// First brand + its latest BIO.
const { data: brand } = await sb.from("brands").select("id, name")
  .order("created_at", { ascending: true }).limit(1).maybeSingle();
if (!brand) { console.error("No brand in DB."); process.exit(1); }
const { data: bioRow } = await sb.from("bios").select("payload, version")
  .eq("brand_id", brand.id).order("version", { ascending: false }).limit(1).maybeSingle();
if (!bioRow) { console.error("No BIO for brand."); process.exit(1); }
const bio = bioRow.payload;

const SLOTS = [
  { slot: "hero-kv",        brief: "Hero key visual for the brand's flagship campaign.", role: "A premium hero key visual." },
  { slot: "editorial",      brief: "Editorial image for a long-form brand story.",       role: "An editorial, magazine-grade image." },
  { slot: "ad-creative",    brief: "Paid social ad creative, full-bleed photograph.",    role: "A paid-social ad background, clear hero hierarchy, no text." },
  { slot: "moodboard-tile", brief: "Mood board tile: texture & material close-up.",      role: "A cohesive mood-board imagery tile, on-palette, no text." },
];
// Schnell is the current production baseline for ad-creative + mood-board tiles;
// include it so the user compares it against Pro and gpt-image-2 on the same prompt.
const MODELS = ["vendor/fal/flux-schnell", "vendor/fal/flux-1.1-pro", "vendor/fal/gpt-image-2"];

const DATE = process.env.BENCH_DATE || "bench";        // pass BENCH_DATE=2026-06-02 for a dated folder
const outDir = `docs/benchmarks/${DATE}`;
mkdirSync(outDir, { recursive: true });
const lines = [`# Image benchmark — brand: ${brand.name} (BIO v${bioRow.version})`, ""];

for (const { slot, brief, role } of SLOTS) {
  const prompt = composeImagePrompt({ spec: { payload: { role } }, brand, bio, refusals: [], brief });
  for (const route of MODELS) {
    const tag = route.split("/").pop();
    process.stdout.write(`Generating ${slot} · ${tag}… `);
    let done = null, err = null;
    for await (const ev of generate({ route, prompt, size: "landscape_16_9" })) {
      if (ev.type === "done") done = ev;
      if (ev.type === "error") err = ev.message;
    }
    if (err) { console.log(`ERROR: ${err}`); lines.push(`- ${slot} · ${tag}: ERROR ${err}`); continue; }
    const res = await fetch(done.asset_url);
    const buf = Buffer.from(await res.arrayBuffer());
    const file = `${slot}-${tag}.png`;
    writeFileSync(`${outDir}/${file}`, buf);
    console.log(`saved ${file} ($~${done.cost_usd})`);
    lines.push(`- ${slot} · ${tag}: ![${file}](./${file}) — est $${done.cost_usd}`);
  }
  lines.push("");
}
writeFileSync(`${outDir}/results.md`, lines.join("\n") + `\n\n## Prompt basis\nSame composed prompt per slot across both models.\n`);
console.log(`\nDone → ${outDir}/results.md`);
```

- [ ] **Step 2: Add a convenience npm script**

In root `package.json` `scripts`, add:

```json
    "bench:image": "node --env-file=server/.env scripts/bench-image.mjs",
```

- [ ] **Step 3: Run the benchmark**

Run: `BENCH_DATE=2026-06-02 npm run bench:image`
Expected: 12 PNGs (4 slots × 3 models: Schnell, Flux Pro, gpt-image-2) + `results.md` under `docs/benchmarks/2026-06-02/`. Console prints each save line. (Requires `FAL_API_KEY` in `server/.env` — already present.) ~12 images, still cents.

- [ ] **Step 4: Commit (script only; benchmark images are artifacts)**

```bash
git add scripts/bench-image.mjs package.json
git commit -m "feat: add Flux-vs-gpt-image-2 offline benchmark script"
```

> **HANDOFF CHECKPOINT:** After running, show the user the 6 images + costs and let them pick which premium slots (if any) move to gpt-image-2. Moving a slot = edit `src/portal-data.js` `model:` for that agent to `gptimage` + `npm run seed:specs`. That reseed is OUT OF SCOPE for this plan and only done on explicit user approval.

---

## Workstream 2 — Ad Creative art-direction coherence

### Task 4: `composeImagePrompt` honours `artDirection`

**Files:**
- Modify: `server/src/lib/compose-image-prompt.js`
- Test: `server/src/lib/compose-image-prompt.test.mjs`

- [ ] **Step 1: Write the failing tests**

Append to `server/src/lib/compose-image-prompt.test.mjs`:

```js
test("with artDirection the prompt leads with the directed scene", () => {
  const p = composeImagePrompt({ ...base, artDirection: "Full-bleed photo of a single cold brew glass on sun-warmed stone." });
  assert.match(p, /art direction/i);
  assert.match(p, /sun-warmed stone/);
});

test("without artDirection there is no art-direction line", () => {
  const p = composeImagePrompt(base);
  assert.doesNotMatch(p, /art direction/i);
});

test("artDirection still forbids rendering text", () => {
  const p = composeImagePrompt({ ...base, artDirection: "A pastel still life." });
  assert.match(p, /real-world plausibility/i);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test server/src/lib/compose-image-prompt.test.mjs`
Expected: the two new positive tests FAIL (`art direction` not found).

- [ ] **Step 3: Implement `artDirection`**

In `server/src/lib/compose-image-prompt.js`, change the signature:

```js
export function composeImagePrompt({ spec, brand, bio, refusals = [], brief, sourceText = null }) {
```
to:
```js
export function composeImagePrompt({ spec, brand, bio, refusals = [], brief, sourceText = null, artDirection = null }) {
```

Then, immediately after the `lines.push(String(brief || "").trim());` line, add:

```js
  /* When a paired copy specialist supplied explicit art direction, it
     becomes the dominant instruction — the image IS the scene the copy
     was written for. Still text-free (the copy lives on its own card). */
  if (artDirection) {
    lines.push(`Art direction (follow precisely): ${String(artDirection).trim()} Do not render any text in the image.`);
  }
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test server/src/lib/compose-image-prompt.test.mjs`
Expected: all tests pass (old + 3 new).

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/compose-image-prompt.js server/src/lib/compose-image-prompt.test.mjs
git commit -m "feat: composeImagePrompt leads with paired-copy art direction"
```

---

### Task 5: Deliverables carry a `visualDirection` field

**Files:**
- Modify: `server/src/lib/deliverables.js` (`buildDeliverableContract` ~line 99, `coerceItem` ~line 65)
- Test: `server/src/lib/deliverables.test.mjs`

- [ ] **Step 1: Write the failing tests**

Append to `server/src/lib/deliverables.test.mjs`:

```js
import { buildDeliverableContract, parseDeliverables } from "./deliverables.js";

test("buildDeliverableContract adds a visualDirection field when withVisualDirection", () => {
  const c = buildDeliverableContract({ type: "ad", part: "primary text", count: 2, platform: "meta_feed", withVisualDirection: true });
  assert.match(c, /visualDirection/);
});

test("buildDeliverableContract omits visualDirection by default", () => {
  const c = buildDeliverableContract({ type: "ad", part: "body", count: 1, platform: "generic" });
  assert.doesNotMatch(c, /visualDirection/);
});

test("parseDeliverables preserves a visualDirection field on each item", () => {
  const raw = JSON.stringify({ deliverables: [{ title: "A", body: "buy now", visualDirection: "warm stone still life" }] });
  const { deliverables } = parseDeliverables(raw);
  assert.equal(deliverables[0].visualDirection, "warm stone still life");
});

test("parseDeliverables leaves visualDirection undefined when absent", () => {
  const { deliverables } = parseDeliverables(JSON.stringify({ deliverables: [{ title: "A", body: "x" }] }));
  assert.equal(deliverables[0].visualDirection, undefined);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test server/src/lib/deliverables.test.mjs`
Expected: the new tests FAIL.

- [ ] **Step 3: Add the `withVisualDirection` option to the contract**

In `server/src/lib/deliverables.js`, replace the whole `buildDeliverableContract` function with:

```js
export function buildDeliverableContract({ type, part = "body", count = 1, platform = "generic", withVisualDirection = false } = {}) {
  const label = typeSpec(type)?.label || "deliverable";
  const ps = platformSpec(platform);
  const lenRule = ps.copyMaxChars
    ? `Keep each ${part} within ~${ps.copyMaxChars} characters.`
    : `Length as the format demands.`;
  const n = Math.max(1, Math.round(Number(count)) || 1);
  const shape = withVisualDirection
    ? `{"deliverables":[{"title":"short label","body":"the ${part}","visualDirection":"one art-direction sentence for the paired image: subject, composition, lighting, mood — no text"}]}`
    : `{"deliverables":[{"title":"short label","body":"the ${part}"}]}`;
  const vdRule = withVisualDirection
    ? ` For each item also write a single "visualDirection" sentence describing the image that should accompany it (subject, composition, lighting, mood) — never instruct text in the image.`
    : ``;
  return [
    `Return STRICT JSON only — no preamble, no markdown fences:`,
    shape,
    `Produce exactly ${n} distinct, complete ${label} deliverable(s) for ${ps.label}.`,
    `Each must stand on its own and be ready to ship. Tone: ${ps.tone}. ${lenRule}${vdRule}`,
    `Do not number them in the body. Do not add any commentary outside the JSON.`,
  ].join(" ");
}
```

- [ ] **Step 4: Preserve `visualDirection` in `coerceItem`**

In `server/src/lib/deliverables.js`, replace the `return {` block at the end of `coerceItem` with:

```js
  return {
    title: typeof d.title === "string" ? d.title : (typeof d.name === "string" ? d.name : ""),
    body,
    ...(typeof d.visualDirection === "string" && d.visualDirection.trim()
      ? { visualDirection: d.visualDirection.trim() }
      : {}),
  };
```

- [ ] **Step 5: Run to verify pass**

Run: `node --test server/src/lib/deliverables.test.mjs`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add server/src/lib/deliverables.js server/src/lib/deliverables.test.mjs
git commit -m "feat: deliverables can carry per-item visualDirection"
```

---

### Task 6: Wire `withVisualDirection` + `artDirection` through the run route

**Files:**
- Modify: `server/src/routes/runs.js` (contract build ~line 130, image compose ~line 135)

- [ ] **Step 1: Pass `withVisualDirection` into the text contract**

In `server/src/routes/runs.js`, change the `deliverableContract` line (~131) from:

```js
        deliverableContract: isDeliverableText
          ? buildDeliverableContract({ type: dlv.type, part: dlv.part, count: Number(dlv.count), platform: dlv.platform })
          : null,
```
to:
```js
        deliverableContract: isDeliverableText
          ? buildDeliverableContract({ type: dlv.type, part: dlv.part, count: Number(dlv.count), platform: dlv.platform, withVisualDirection: !!dlv.withVisualDirection })
          : null,
```

- [ ] **Step 2: Pass `artDirection` into the image composer**

In `server/src/routes/runs.js`, change the `composeImagePrompt` call (~135) from:

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
to:
```js
  const imagePrompt = isImage
    ? composeImagePrompt({
        spec: effectiveSpec,
        brand: brandBio.brand,
        bio: brandBio.bio,
        refusals: brandBio.refusals,
        brief: effectiveBriefText,
        sourceText: dlv?.sourceText || null,
        artDirection: dlv?.artDirection || null,
      })
    : null;
```

- [ ] **Step 3: Verify the server still boots (watch reload) and units pass**

Run: `node --test server/src/lib/deliverables.test.mjs server/src/lib/compose-image-prompt.test.mjs`
Expected: all pass.
Run: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8787/`
Expected: `200` (the `--watch` dev server reloaded the route).

- [ ] **Step 4: Commit**

```bash
git add server/src/routes/runs.js
git commit -m "feat: thread withVisualDirection + artDirection through runs route"
```

---

### Task 7: Copy specs request `visualDirection`; frontend pairs it as art direction

**Files:**
- Modify: `src/portal-data.js` (`a38` override ~line 309; add `a12` override block)
- Modify: `src/portal-briefs.jsx` (copy run ~line 1828 sets `withVisualDirection`; image pairing ~line 1828 reads `visualDirection`)

- [ ] **Step 1: Add `visualDirection` to Ad Copy (`a38`) method + contract**

In `src/portal-data.js`, replace the `a38` `method` and `outputContract` lines with:

```js
    method: ["Identify the target platform(s) from the brief", "Write to the platform's character + format rules", "Generate 3 variants per platform: rational / emotional / refusal", "For each variant, write one visualDirection sentence so the paired Ad Creative image shares the same scene", "Voice-check every line"],
    outputContract: "Per platform: 3 variants × {primary text, headline (≤40 chars), CTA, visualDirection}. No fake urgency.",
```

- [ ] **Step 2: Add a `a12` (Conversion Copy) override block**

In `src/portal-data.js`, in `CI_SPECIALIST_SPECS`, add (after the `/* ── Copy ── */` marker, before `a37`):

```js
  a12: {
    role: "a conversion copywriter for landing, pricing, and hero work that has to move a number",
    objective: "Produce ship-ready conversion copy in the requested format, voice-locked, with the art direction for any paired hero image.",
    method: ["Read BIO voice + forbidden words + the brief's target metric", "Write the copy to format and length", "Write a one-sentence visualDirection for the paired hero image (subject, composition, lighting, mood)", "Self-edit for voice and concreteness"],
    outputContract: "Copy in the requested format · within length · voice-checked · plus a visualDirection sentence for the paired image.",
    voice: "Conviction over cleverness. Concrete nouns, real verbs.",
    refusals: ["Won't write fake urgency.", "Won't use the BIO forbidden words."],
  },
```

- [ ] **Step 3: Tell the copy run to request `visualDirection`, and pair it into the image run**

In `src/portal-briefs.jsx`, locate the per-slot image pairing block (~line 1809–1839). Inside the `for` loop over `items`, change the image run's `deliverableSpec` from:

```js
              deliverableSpec: { type: group.type, part: "image", count: 1, platform, sourceText: items[i].body },
```
to:
```js
              deliverableSpec: { type: group.type, part: "image", count: 1, platform, sourceText: items[i].body, artDirection: items[i].visualDirection || null },
```

- [ ] **Step 4: Make the copy run that drives a visual request `visualDirection`**

In `src/portal-briefs.jsx`, find where the copy specialist run is fired with its `deliverableSpec` (the run whose `done.output.deliverables` feeds the pairing block). Add `withVisualDirection: true` to that copy run's `deliverableSpec` **only when the group has a paired visual** (`visualId` is truthy). Concretely, compute `const hasVisual = !!visualEntry?.[1];` alongside the existing `visualId` derivation, and include `withVisualDirection: hasVisual` in the copy run's `deliverableSpec`.

> If the copy `deliverableSpec` is assembled before `visualId` is known in the current control flow, hoist the `group`/`visualEntry`/`visualId` derivation (currently ~line 1811–1814) above the copy run so `hasVisual` is available when the copy `deliverableSpec` is built.

- [ ] **Step 5: Verify in the running app (no test runner for the SPA)**

1. Hard-refresh the canvas (Cmd+Shift+R).
2. Run a brief that includes a Copy specialist paired with Ad Creative (e.g. the cold-brew brief).
3. Open the copy deliverable JSON in the drawer and confirm each item has a `visualDirection`.
4. Confirm the paired Ad Creative image visibly matches the copy's described scene (not a generic background).

Expected: image and copy card read as one art-directed unit.

- [ ] **Step 6: Commit**

```bash
git add src/portal-data.js src/portal-briefs.jsx
git commit -m "feat: copy specs emit visualDirection; ad creative shares its art direction"
```

---

## Workstream 3 — Structured Mood Board

### Task 8: Mood Board spec + server returns BIO visual slice on the done event

**Files:**
- Modify: `src/portal-data.js` (`a35` spec ~line 283)
- Modify: `server/src/routes/runs.js` (image `done` payload ~line 233–255 and the SSE `done` emit)

- [ ] **Step 1: Rewrite the `a35` mood-board spec for tiles, not one composite**

In `src/portal-data.js`, replace the `a35` block with:

```js
  a35: {
    role: "an art director assembling a brand mood board from imagery tiles plus the brand's palette and type",
    objective: "Produce a set of cohesive imagery/texture tiles (one art direction) that, combined with the brand palette and type, reads as a real mood board — direction, not final art.",
    method: ["Read the BIO visual + concept territory", "Generate distinct but cohesive imagery tiles (texture, scene, detail, material)", "Hold one palette + lens + mood across every tile", "Leave room for swatches + type — the board is composed, not a single frame"],
    outputContract: "3–4 cohesive imagery tiles (no text), on-palette, composed by the app with brand swatches + type into a board.",
    voice: "Restrained. Cinematic. The board speaks; you don't decorate it.",
    refusals: ["Won't render a polished hero — that's a20's job.", "Won't bake text into the tiles."],
  },
```

Also update the `a35` row in `CI_AGENTS` (~line 76) `job` text to: `"Imagery tiles + palette + type composed into a real mood board — the way an art director walks a CMO through direction."` (leave `model:"fluxSchnell"` and `cr:14` unchanged).

- [ ] **Step 2: Return the BIO visual slice on image `done` events**

In `server/src/routes/runs.js`, where the image `done` event is finally emitted to the client over SSE, include a `bio_visual` object so the frontend can render swatches/type without a second fetch. In the object written to the client's `done` SSE for image runs, add:

```js
          bio_visual: {
            palette: brandBio.bio?.visual?.palette || [],
            type:    brandBio.bio?.visual?.type || null,
            imagery: brandBio.bio?.visual?.imagery || [],
          },
```

(Place it alongside `asset_url`/`width`/`height` in the same `done` payload object. This is additive — existing consumers ignore unknown fields.)

- [ ] **Step 3: Verify the server reloaded and a single image run still returns**

Run: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8787/`
Expected: `200`.

- [ ] **Step 4: Commit**

```bash
git add src/portal-data.js server/src/routes/runs.js
git commit -m "feat: mood board spec emits imagery tiles; runs return BIO visual slice"
```

---

### Task 9: Mood-board fan-out + `MoodBoardCard` render

**Files:**
- Modify: `src/portal-briefs.jsx` (assembly run loop; new `MoodBoardCard` component; node render switch)

- [ ] **Step 1: Fan the mood-board run into 3 tiles**

In `src/portal-briefs.jsx`, in the assembly run loop, detect the mood-board specialist by code (`L2-35`) and, instead of the single-image path, fire **3** image runs with distinct facet suffixes, collecting their `asset_url`s and the `bio_visual` slice onto the node. Add this branch where specialists are dispatched:

```js
      // Mood board: fan into cohesive imagery tiles, then compose a board.
      if (agent.code === "L2-35") {
        const FACETS = ["texture & material close-up", "environmental scene", "product-in-context detail"];
        const tiles = [];
        let bioVisual = null;
        for (let i = 0; i < FACETS.length; i++) {
          setNodes((prev) => prev.map((n) => n.id === "spec-" + agent.id
            ? { ...n, state: "running", sub: `rendering tile ${i + 1}/${FACETS.length}…` } : n));
          await streamSpecialistRun({
            specialistId: agent.id,
            briefText: `${context.rawBrief || context.title || ""} — mood board tile: ${FACETS[i]}`,
            briefId: sharedBriefId,
            onProgress: () => {},
            onDone: (img) => {
              const url = img?.output?.asset_url || null;
              if (url) tiles.push(url);
              if (!bioVisual && img?.output?.bio_visual) bioVisual = img.output.bio_visual;
            },
            onError: () => {},
          });
        }
        setNodes((prev) => prev.map((n) => n.id === "spec-" + agent.id
          ? { ...n, state: "done", kind: "moodboard", tiles, bioVisual, sub: `${tiles.length} tiles · board` } : n));
        continue; // skip the generic single-image handling for this specialist
      }
```

> Match `streamSpecialistRun`'s actual call signature in this file; the keys above (`specialistId`, `briefText`, `briefId`, `onProgress`, `onDone`, `onError`) mirror the existing per-slot pairing call. Confirm `done.output.bio_visual` and `done.output.asset_url` are how this file already surfaces image-run results (see the pairing block's `img?.output?.asset_url`).

- [ ] **Step 2: Add the `MoodBoardCard` component**

In `src/portal-briefs.jsx`, add a presentational component (near the other node-body components):

```jsx
function MoodBoardCard({ tiles = [], bioVisual = null }) {
  const palette = bioVisual?.palette || [];
  const imagery = bioVisual?.imagery || [];
  const typeName = bioVisual?.type?.heading || bioVisual?.type?.name || null;
  return (
    <div className="moodboard">
      <div className="moodboard-tiles">
        {tiles.map((url, i) => (
          <img key={i} src={url} alt="" className="moodboard-tile" />
        ))}
      </div>
      {palette.length > 0 && (
        <div className="moodboard-swatches">
          {palette.map((p, i) => (
            <span key={i} className="moodboard-swatch" style={{ background: p.hex || "#ccc" }} title={`${p.name || ""} ${p.hex || ""}`.trim()} />
          ))}
        </div>
      )}
      {typeName && <div className="moodboard-type">{typeName}</div>}
      {imagery.length > 0 && (
        <div className="moodboard-keywords">
          {imagery.slice(0, 4).map((k, i) => <span key={i} className="moodboard-kw">{k}</span>)}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Render `MoodBoardCard` for `kind === "moodboard"` nodes**

In `src/portal-briefs.jsx`, in the node-body render (where image nodes render `assetUrl`), add a branch BEFORE the generic image branch:

```jsx
            {node.kind === "moodboard"
              ? <MoodBoardCard tiles={node.tiles} bioVisual={node.bioVisual} />
              : /* existing image / text rendering stays here */ null}
```

Wire any click via the existing `onNodeClick` prop — never a direct `<div onClick>` (canvas gotcha). Keep the existing rendering for all other node kinds intact.

- [ ] **Step 4: Add mood-board styles**

In `public/intelligence/portal.css`, add:

```css
.moodboard { display: flex; flex-direction: column; gap: 8px; padding: 8px; }
.moodboard-tiles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; }
.moodboard-tile { width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 4px; }
.moodboard-swatches { display: flex; gap: 4px; }
.moodboard-swatch { width: 22px; height: 22px; border-radius: 4px; border: 1px solid rgba(0,0,0,.1); }
.moodboard-type { font-size: 13px; opacity: .8; }
.moodboard-keywords { display: flex; flex-wrap: wrap; gap: 4px; }
.moodboard-kw { font-size: 11px; padding: 2px 6px; border-radius: 999px; background: rgba(0,0,0,.06); }
```

- [ ] **Step 5: Verify in the running app**

1. Hard-refresh the canvas.
2. Run a brief that includes The Mood Board (Concept dept).
3. Confirm the node renders a 3-tile grid + palette swatches + type + keyword chips — a real board, not one photo.

Expected: The Mood Board reads as a composed board.

- [ ] **Step 6: Commit**

```bash
git add src/portal-briefs.jsx public/intelligence/portal.css
git commit -m "feat: structured MoodBoardCard with imagery tiles + brand palette/type"
```

---

## Final verification

- [ ] **Run the full unit suite**

Run: `npm run test:units`
Expected: all pass (includes the new fal-image, compose-image-prompt, deliverables tests).

- [ ] **End-to-end run (no code edits mid-run, per the blank-canvas lesson)**

1. Ensure `npm run dev:all` is up (web + api + inngest).
2. Hard-refresh, run the cold-brew brief to completion without touching code.
3. Confirm: (a) Ad Creative image matches its copy's `visualDirection`; (b) The Mood Board renders as a structured board; (c) benchmark images exist for your gpt-image-2 decision.

---

## Self-review notes (author)

- **Spec coverage:** WS1 → Tasks 1–3; WS2 → Tasks 4–7; WS3 → Tasks 8–9. Resolved decisions honoured: benchmark uses the in-DB BIO (Task 3); gpt-image-2 included for premium slots in the benchmark (Task 3 — mood-board tiles can be benchmarked by temporarily pointing a tile run at the route, noted as out-of-scope reseed); `visualDirection` on Conversion Copy (a12) + Ad Copy (a38) (Task 7).
- **No live reseed** is performed anywhere — production routing is unchanged until the user approves per-slot moves.
- **Frontend tasks** carry "confirm against the actual `streamSpecialistRun` signature / node-render switch" notes because `portal-briefs.jsx` has no test runner; verification is by running the app.
- **CanvasHeader, SSE flow, queue-poll path:** untouched.

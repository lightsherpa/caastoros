# Image Quality Overhaul — Design Spec

**Date:** 2026-06-02
**Status:** Draft for review
**Scope:** One image-quality workstream covering three problems reported on the brief-run canvas: (1) raw image fidelity, (2) incoherent Ad Creative output, (3) Mood Board is not a real mood board.

---

## Background

The user reported, on a live brief run (Vinilo-style cold-brew brief):

1. **fal/Flux quality is below standard** — wants to benchmark a stronger model.
2. **Ad Creative looks broken** — the generated background and the copy card are disjointed ("looks terrible").
3. **The Mood Board is not a mood board** — it renders as a single flat photo strip, not a real board.

### Current image pipeline (as-built)

- All images route through `server/src/lib/models/fal-image.js`. It exposes `generate({route, prompt, size})` which submits to the fal queue, polls `IN_QUEUE → IN_PROGRESS → COMPLETED`, then reads `images[0].url`. Only three routes exist today: `vendor/fal/flux-1.1-pro`, `vendor/fal/flux-schnell`, `vendor/fal/recraft-v3`.
- Short keys → routes live in `scripts/seed-specs.mjs` `MODEL_MAP`, seeded into the `specs` table that the runtime router reads.
- **`gptimage` is a fake alias** — it currently maps to `vendor/fal/flux-1.1-pro` (comment: *"was gpt-image-1; switched per cost+quality memo"*). There is no real GPT-image integration and no `OPENAI_API_KEY` in `server/.env`.
- The image prompt is built by `server/src/lib/compose-image-prompt.js` from the BIO visual slice + spec role + brief. It explicitly instructs the model **not to render text**, and (when `sourceText` is passed) to "depict its subject and mood; do not render the text itself."
- Per-slot image pairing happens in `src/portal-briefs.jsx` (~line 1809): after a copy specialist returns N deliverables, the canvas finds the paired visual specialist and fires one image run per copy card, passing `deliverableSpec.sourceText = items[i].body`.

### Root causes (confirmed by reading the pipeline, not guessed)

- **Ad Creative disjointed:** the image run only receives the copy `body` as `sourceText`, and the composer is told to depict only "subject and mood." The copywriter's explicit **VISUAL DIRECTION** (visible in the Conversion Copy deliverable, e.g. *"Full-bleed photograph. A single glass of cold brew on a sun-warmed surface…"*) never reaches the image prompt. The image and the copy are art-directed **independently**, so they read as pasted together.
- **Mood Board:** routed to a single `flux-schnell` gen prompted as one photo. A mood board is inherently a *composition* (palette + type + imagery tiles); no single text-to-image model produces one well. This is a format/structure problem, not a model-quality problem.
- **Raw fidelity:** genuinely a model lever — addressed by benchmarking GPT Image 2.

---

## Decisions (locked with user)

| Decision | Choice |
|---|---|
| Sequencing | Fix all three together as one image-quality workstream. |
| Benchmark model | **GPT Image 2 via fal** (`openai/gpt-image-2`), `quality: high`. |
| Ad Creative output | **Art-directed image + copy card (coherent pair).** Image stays text-free; it is generated FROM the copy's visual direction so the two share one art direction. No text baked into the image. |
| Mood Board output | **Structured board:** palette swatches + type specimens + mood keywords (from BIO) + 3–4 generated imagery/texture tiles, composed in a grid. |

---

## Workstream 1 — Wire GPT Image 2 (real) + cheap benchmark

### 1a. Add the real fal route

In `server/src/lib/models/fal-image.js`, add to `FAL_ROUTES`:

```js
"vendor/fal/gpt-image-2": {
  endpoint: "/openai/gpt-image-2",
  payload: ({ prompt, size = "landscape_16_9" }) => ({
    prompt,
    image_size: size,          // shares the existing enum (square_hd, landscape_16_9, …)
    quality: "high",
    num_images: 1,
    output_format: "png",
  }),
  cost_estimate_usd: 0.07,     // placeholder; GPT Image 2 is token-priced ($8/1M in, $30/1M out)
},
```

- The queue base (`https://queue.fal.run`) and the poll/download/`images[0].url` parsing are **unchanged** — GPT Image 2's response shape is identical to the Flux routes.
- `isImageRoute()` already matches any `vendor/fal/*`, so no router change is needed.
- **Cost note:** fal returns no flat per-image cost for token-priced models. The benchmark logs whatever cost metadata fal includes; otherwise we record the placeholder estimate. Production cost tracking keeps the estimate until we have real numbers.

### 1b. Remap the short key

In `scripts/seed-specs.mjs` `MODEL_MAP`: `gptimage: "vendor/fal/gpt-image-2"` (was `vendor/fal/flux-1.1-pro`). **No specs reseeded yet** — see 1c.

### 1c. Benchmark harness (no production routing change)

New `scripts/bench-image.mjs`:
- Loads one real brand BIO + a brief (default the cold-brew brief; brand selectable via env).
- Composes the prompt once with `composeImagePrompt` and runs it through **both** `vendor/fal/flux-1.1-pro` and `vendor/fal/gpt-image-2` for three slots: **Hero KV**, **Editorial Image**, **Ad Creative**.
- Saves all images to `docs/benchmarks/<date>/<slot>-<model>.png` side-by-side and writes a small `results.md` (prompt used + cost/metadata per image).
- User eyeballs winners.

**Cost guard:** ~6 images total (a few cents). **Live specs are NOT changed by this workstream.** Moving specific premium slots to `gpt-image-2` is a follow-up `MODEL_MAP` edit + reseed, done only after the user picks winners. Volume slots (social, mood-board tiles) stay on Schnell.

---

## Workstream 2 — Ad Creative art-direction coherence

**Goal:** the Ad Creative image is the scene the copywriter art-directed, so image + copy card read as one unit. Image remains text-free.

### 2a. Structured `visualDirection` from paired copy

- Copy specialists that pair with a visual emit a structured **`visualDirection`** string in their `outputContract` (today the art direction is loose prose buried in `body`). Affected spec(s): the copy deliverable types that drive paired visuals (e.g. Conversion Copy / Ad Copy). Defined in `src/portal-data.js` (`CI_SPECIALIST_SPECS` / `CI_DEPT_SPECS`).
- Backward compatible: if a deliverable has no `visualDirection`, behaviour falls back to today's `sourceText = body`.

### 2b. Thread it into the image run

- In `src/portal-briefs.jsx` per-slot pairing (~1828), pass the paired copy item's `visualDirection` (+ headline/title) into the image run via a new `deliverableSpec.artDirection` field (kept distinct from `sourceText`).
- `server/src/routes/runs.js` forwards `artDirection` into `composeImagePrompt`.

### 2c. Composer honours art direction

- In `server/src/lib/compose-image-prompt.js`, when `artDirection` is present it **leads** the prompt as the dominant instruction (the scene/composition/lighting the copy specified), with BIO palette/type/imagery as supporting constraints. The "do not render text" guardrail stays.

**Result:** background and copy card share one art direction; the disjoint look is resolved without baking text into the image.

---

## Workstream 3 — Structured Mood Board

**Goal:** a real board: palette + type + mood keywords + a few cohesive imagery tiles.

### 3a. Run output

- The Mood Board specialist run produces **3–4 imagery/texture tiles** under one art direction (cheap model — Schnell by default; gpt-image-2 optionally included in the benchmark).
- It returns the tiles plus structured brand data pulled from the BIO: `visual.palette` (name + hex swatches), `visual.type` (type specimens), and mood keywords (from `visual.imagery` / positioning).

### 3b. Client-side composition

- New React component **`MoodBoardCard`** in `src/portal-briefs.jsx` composes the grid deterministically: palette swatch row + type specimens + imagery tiles + keyword chips. Crisp, on-brand, editable, cheap.
- Renders as the Mood Board node's body inside `InteractiveCanvas`, wired via the `onNodeClick` prop (per the documented canvas gotcha — never a direct `<div onClick>`). **CanvasHeader is untouched.**

---

## Touch list (blast radius)

| File | Change |
|---|---|
| `server/src/lib/models/fal-image.js` | + `vendor/fal/gpt-image-2` route |
| `scripts/seed-specs.mjs` | `MODEL_MAP.gptimage` → gpt-image-2 |
| `scripts/bench-image.mjs` | **new** benchmark harness |
| `server/src/lib/compose-image-prompt.js` | honour `artDirection`; lead prompt when present |
| `server/src/routes/runs.js` | forward `artDirection` from `deliverableSpec` |
| `src/portal-data.js` | copy `outputContract` gains `visualDirection`; mood-board spec emits tiles + structured fields |
| `src/portal-briefs.jsx` | pairing passes `artDirection`; new `MoodBoardCard` component |

**Out of scope / explicitly unchanged:** run/SSE streaming flow, queue-and-poll image path, CanvasHeader, workspace/palette experiments, any live spec reseed (deferred until benchmark winners are chosen).

---

## Testing

- **fal route:** unit-add to existing fal route handling; smoke via `bench-image.mjs` (asserts a non-empty `images[0].url` from gpt-image-2).
- **Ad Creative:** verify `composeImagePrompt` leads with `artDirection` when present and falls back cleanly when absent (extend `compose-image-prompt.test.mjs`).
- **Mood Board:** `MoodBoardCard` renders from a fixture BIO + tile set (swatches, type, tiles, keywords all present); degrades gracefully if a BIO field is missing.
- **End-to-end:** one real brief run after wiring, watched to completion without a code edit mid-run (per the prior blank-canvas lesson).

## Cost posture (per standing rules)

- Benchmark is ~6 images, one-off.
- Mood-board tiles and social/volume stay on Schnell ($0.003/img).
- GPT Image 2 (high) is reserved for premium slots and only after user-approved per-slot moves.
- User only ever sees credits, never raw API cost.

## Resolved decisions (reviewer answers, 2026-06-02)

1. **Benchmark BIO:** use the brand BIO currently in the DB (the live one from the cold-brew run) — no new BIO compile.
2. **Mood-board tiles:** include **gpt-image-2** in the benchmark for the imagery tiles too (compare against Schnell on the same tile prompts). Production routing still deferred until winners are picked.
3. **`visualDirection` field:** confirmed for **Conversion Copy + Ad Copy**.

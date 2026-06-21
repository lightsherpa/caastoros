# BIO Discovery Overhaul — Implementation Plan

> Goal: make Discovery → BIO accurate enough that the human Steward **verifies and patches**, never rewrites. The moat is the certified BIO + the structured schema every specialist inherits; today the extraction is starved (one homepage) and three fields are faked (score, confidence, gaps). This plan closes that.
> Status: PLAN ONLY. No code changed. Synthesized from 6 research lanes (2026-06-21).

## Gaps being closed

| Gap | Today | Closed by |
|---|---|---|
| G1 | Single homepage scrape only | Increment 1 (crawl) |
| G2 | Uploaded sources ignored at synthesis | Increment 1 (read all `bio_sources`) |
| G3 | Instagram handle collected, never sent | Increment 1 (wire through) |
| G4 | `visual{}` always empty | Increment 4 (visual extract) |
| G5 | Score hardcoded `50` | Increment 2 (deterministic `scoreBio`) |
| G6 | No per-field confidence | Increment 2 (confidence map) |
| G7 | "tell you what we couldn't find" has no backend | Increment 2 (`missing[]`) |
| G8 | Refusals not generated (Vinilo fallback) | Increment 3 (generate refusals) |

## Resolved architecture decision — confidence as a sibling map

Confidence + source live in a **parallel map on the payload**, NOT nested into each field:

```jsonc
payload = {
  identity: { positioning: "Specialty coffee for slow Tuesdays.", ... },   // values stay plain strings
  ...
  confidence: {                                   // NEW, additive, optional
    "identity.positioning": { conf: 88, source: "homepage hero + about" },
    "identity.founded":     { conf: 40, source: "inferred — not stated" }
  },
  missing: [ { field: "goals.q3", why: "no roadmap surfaced" } ],          // NEW (G7)
  // refusals → brands.refusals column (G8), not payload
}
```

**Why:** every existing reader (`prompt.js renderBioLayer`, `sharpener.js`, `compose-specialist-prompt.js`, the SPA viewers, the Vinilo seed) keeps reading `payload.identity.positioning` as a string — untouched. New consumers (score, focus-list, the confidence bars) read the `confidence`/`missing` keys, which old data simply lacks (treated as `{}`/`[]`). No unwrap shim, no `normalizeBio()` flag-day, no risk of `[object Object]` in Brandolph's prompt. Fully back-compatible; no DB migration.

## Pipeline after changes

```
Discovery UI  ──(uploads first, then)──▶ POST /api/discovery/start { url, instagram }
      ▼
discovery/start (Inngest)
      ▼
compile-bio.js
  step 1  mapAndScrape(url)          → ≤6 high-signal pages (home/about/story/values/product)   [G1]
  step 1b gather bio_sources         → + uploaded-file text + instagram signal                  [G2,G3]
  step 2  synthesize (Gemini 2.5 Pro)→ values + payload.confidence{} + payload.missing[] + refusals  [G6,G7,G8]
  step 2b extract-visual             → palette+type from CSS ($0) · imagery+avoid via 1 Gemini Flash call  [G4]
  step 3  write bios row             → score = scoreBio(payload)  (was 50)                        [G5]
          write brands.refusals
  step 4  enqueue steward_jobs
      ▼
GET /api/steward/jobs/:id           → + computeFocus(payload) ranked "focus first" list          [Steward]
BioViewer / TeamJob                  → real confidence bars, score, missing list, focus list
```

## Increments (each independently shippable + verifiable, all behind `DISCOVERY_V2` env gate, default OFF)

### Increment 1 — Ingestion: crawl + uploads + instagram  (Tier 1a · biggest accuracy win, non-breaking)
- `firecrawl.js`: add `mapAndScrape(url, {max:6})` — Firecrawl `/map` → filter links by `/(about|story|manifesto|mission|values|product|press|brand)/i` → scrape each (always incl. homepage), dedupe, cap. Fall back to homepage-only if `/map` fails. **N-sequential scrapes** (fits the current Inngest step model; avoids `/crawl` async restructure).
- `compile-bio.js` step 1: use `mapAndScrape`; one `bio_sources` row per page.
- `compile-bio.js` step 1b (new): read all `bio_sources` for the brand; for `kind:file_upload` text files (pdf/docx/pptx/txt/md) fetch `raw_ref` signed URL and scrape→text via Firecrawl; skip images (visual bucket → Increment 4). Concatenate under a 48k char budget (70% site / rest uploads), each block labeled with source.
- Instagram: bind the input in `portal-discovery.jsx` (currently `defaultValue`, never read), send in `/discovery/start` body → `discovery.js` → event data → labeled text signal in synthesis + a `bio_sources` row (`kind:instagram_handle`).
- **Upload-ordering fix** (the race): uploads currently fire *after* discovery. Recommended: new `POST /api/discovery/resolve-brand` returns `brandId` without firing → UI uploads files → then `POST /discovery/start`. ⚠️ touches onboarding flow — **needs user OK** (standing rule).
- Cost: +~$0.006 Firecrawl + ~$0.01–0.02 larger input ≈ **+$0.02–0.03/BIO**.

### Increment 2 — Confidence + score + gaps  (Tier 1b · additive)
- `compile-bio.js COMPILER_SYSTEM`: keep value schema as-is; ADD instructions to also emit `confidence` (per dotted-path `{conf 0-100, source}`, honestly calibrated — 85+ only when explicit, <30 → leave empty + add a gap) and `missing[]`. Bump `maxTokens` 4000→~5000.
- New `server/src/lib/score-bio.js` — pure `scoreBio(payload)` = `100*(0.5*coverage + 0.35*avgConf + 0.15*sourceDiversity)`. Ships with `score-bio.test.mjs` (asserts richer→higher, empty→0, bounded). Add to `test:units`.
- `compile-bio.js` step 3: `score: scoreBio(bioPayload)`. `bios.js` PATCH: `score: scoreBio(body.payload)` (drop client-supplied score).
- `portal-discovery.jsx payloadToFields`: read `conf`/`source` from `payload.confidence[path]`; read gaps from `payload.missing` (line ~855 currently hardcodes `[]`). Existing `Confidence` / `EditableField` components unchanged — they already consume `f.conf`/`f.source`.

### Increment 3 — Brand refusals  (Tier 2a)
- `compile-bio.js`: have the synth call also emit `refusals[]` derived from `voice.forbidden` + `strategic.notList`; write to `brands.refusals` (column exists). Only write when `brands.refusals` is empty (preserve Steward edits). `load-brand-bio.js` already prefers `brands.refusals` over the Vinilo fallback — no loader change.

### Increment 4 — Visual extraction  (Tier 2b)
**Decision (Lane C): deterministic for palette+fonts, ONE cheap vision call for imagery+avoid.**
- Palette: **deterministic, $0** — request `rawHtml` on the existing scrape, parse hex/`rgb()`/CSS-vars, quantize by frequency, top ~5, name via local nearest-color table. (LLMs are unreliable at exact hex — do NOT use vision here.)
- Type: **deterministic, $0** — `@font-face` / `font-family` stacks / Google-Fonts·Typekit `<link>` from `rawHtml`.
- Imagery + avoid: **one Gemini 2.5 Flash vision call** on a Firecrawl `screenshot` (viewport, not full-page → stable cost), seeded with already-synthesized `voice`+`notList` so "avoid" is grounded. Mirrors existing `qa-vision.js` exactly (same model, same `image_url` path). ~**$0.0014/BIO**.
- New `extract-visual-deterministic.js` + `extract-visual-vision.js`; merge into `payload.visual` in a `step.run("extract-visual")` that degrades to `[]` on failure. No new model adapter. Validate every palette hex against `/^#[0-9a-f]{6}$/`.

### Increment 5 — Steward focus list  (Tier 2c · depends on Inc 2)
- New `server/src/lib/bio-focus.js` — pure `computeFocus(payload)`: gaps bucket first, then present fields by `importance × (1 − conf/100)`, drop `conf ≥ 92`. Importance map keyed to downstream blast radius (positioning / voice.forbidden / audience.primary = 1.0; category/pillars/register/jtbd/northStar = 0.6; rest = 0.3). Each item: `{field,label,status,conf,value,source,why,action}` with templated `why`/`action` (no LLM). Ships with `test-bio-focus.mjs`.
- `steward.js GET /jobs/:id`: add `focus: computeFocus(bio.payload)` to the response (computed on read, not stored).
- `bios.js GET /:brandId`: add `focusCount` only (softened) for the client.
- `portal-team.jsx TeamJob`: "Focus first · N" panel atop the right rail; click an item → scroll+focus the matching field editor.
- `portal-discovery.jsx BioViewer`: soft line "Brandolph flagged N areas for your Steward" (no field/action detail client-side).

### Tier 3 — deferred (leave hooks, do not build)
| Item | Add-when | Hook left now |
|---|---|---|
| Incremental re-compile on new source | uploads-after-onboarding is a real flow + cost shows in logs | event already accepts optional `sources[]`; `bios` is versioned |
| Competitor-scan input | watchout quality is the named complaint | no-op `competitorContext` slot in synth builder; reuse `bio_sources.kind='competitor'` |
| Real Instagram/social scrape | a vetted provider chosen under cost rule | Increment 1 reads `bio_sources` generically — a connector just inserts rows, no reader change |

## Migration

**None required.** `bios.payload` is `jsonb` (confidence/missing/visual live here), `bios.score` is `int`, `brands.refusals` is `text[]`, `bio_sources` covers crawl pages + uploads + IG + screenshot ref. Optional `steward_jobs.gap_count` column is deferred (focus-list reads payload via the existing FK).

## Cost-at-scale (one-time per brand at onboarding)

| | Before | After |
|---|---|---|
| Crawl (Firecrawl) | 1 page ~$0.002 | ≤6 pages + map ~$0.006 |
| Synthesis (Gemini 2.5 Pro) | ~$0.08 | ~$0.10–0.12 (bigger input + wrapped output) |
| Visual: CSS palette+fonts | — | $0 |
| Visual: 1 Gemini Flash call | — | ~$0.0014 |
| **Per BIO** | **~$0.08** | **~$0.11–0.14** |
| **Per 10k brands** | ~$800 | **~$1.1–1.4k** |

A one-time, amortized-over-lifetime cost; does not touch the recurring per-run economics that frame the moat. Guards: page cap (≤6), 48k input truncation, skip-vision when no screenshot, one vision call max, IG/uploads = text-in only. User sees **credits only** — never these figures.

## Verification (per gap → observable proof)

| Gap | Proof |
|---|---|
| G1 | ≥2 `url_scrape` `bio_sources` rows for one URL |
| G2 | a populated field's `confidence[path].source` references an uploaded file |
| G3 | an instagram `bio_sources` row exists + handle in synth input |
| G4 | `payload.visual.palette[0].hex` matches `/^#[0-9a-f]{6}$/` |
| G5 | two brands of different richness get different scores; neither stuck at 50 |
| G6 | `payload.confidence["identity.positioning"].conf` is a number |
| G7 | sparse site → non-empty `payload.missing[]`; rich site → shorter |
| G8 | `brands.refusals` non-empty + ≠ `VINILO_REFUSALS` |

- Pure-fn `node --test` checks: `score-bio`, `bio-focus`, palette-extract, source-concat, field/missing-collect.
- Extend `scripts/test-discovery.mjs`: fire on a real URL, poll `bios`, assert score≠50 / palette non-empty / `missing[]` present / ≥2 sources / per-field conf.
- E2E (localhost + Playwright): run discovery without then with uploads+IG → score rises, missing[] shrinks, a field traces to the upload, focus list ranks the thin fields.

## Rollout

`DISCOVERY_V2` (master) + `DISCOVERY_CRAWL_PAGES` + `DISCOVERY_VISION` env flags, default OFF → pipeline runs exactly as today. BIO shape additive + read-tolerant, so V2 BIOs render after rollback and old BIOs render under V2. Rollback = flip the flag, no code revert. Cost tripwire: existing `usage.cost_usd` logging; verify per-BIO under ceiling before enabling broadly.

## Open decisions (need your call)

1. **Confidence shape** — I've planned the **sibling `payload.confidence` map** (non-breaking) over nested per-field. Confirm.
2. **Upload-ordering fix** — adds `POST /api/discovery/resolve-brand` so uploads attach before discovery fires. Touches onboarding flow → your call per "don't change flow without verifying."
3. **Refusals** — generate only when `brands.refusals` is empty (preserve Steward edits). OK?
4. **Crawl** — N-sequential scrapes ≤6 pages (vs `/crawl` async). OK to default to sequential?

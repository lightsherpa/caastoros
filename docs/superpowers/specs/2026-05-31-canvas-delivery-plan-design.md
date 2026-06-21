# Canvas Delivery Plan — Design Spec

> Goal: **The canvas produces complete, on-brand, creative output — including visuals — that a user can actually ship.**

Status: design approved in brainstorming, pending user review of this spec.
Author: CaastorOS / Brandolph canvas work.
Date: 2026-05-31.

---

## 1. Problem

The canvas (the MOAT after the BIO) produces results that are **unusable**:

1. **Generic** — specialist outputs read like generic AI, not senior brand work.
2. **Incomplete** — "a week of content" returns a thin blob, not 5+ complete posts.
3. **No visuals** — image/graphic output never appears, even for social/ad briefs.
4. **Not selectable** — one specialist = one output blob; the user cannot pick, keep, or ship individual deliverables.

The unifying defect: the system has **no concept of a deliverable**. A specialist runs once and emits one freeform text blob (or one image). A request that implies *N distinct deliverables* has nowhere to put them.

## 2. Root causes (code-grounded)

| # | Symptom | Cause | Location |
|---|---------|-------|----------|
| R1 | No visuals ever | Sharpener told to "propose 2–4 **text** specialists from **a01–a18**" — excludes the entire visual roster (a19–a46). Self-contradicts lines 141–146. | `server/src/lib/sharpener.js:48` |
| R2 | Incomplete output | `maxTokens = cr_estimate × 100`. Social Captions (cr 3) → **300 tokens** for the whole run. Cannot fit 5 posts. | `server/src/routes/runs.js:255` |
| R3 | Thin coverage | Assembly hard-capped at 3 (`.slice(0,3)`), Sharpener path at 4. | `portal-brandolph.jsx:788`; `sharpener.js:225` |
| R4 | Generic | Aggressive cost-downgrades put weak models (haiku/gemFlash) on creative tasks. Flagged: Territory Mapper 40/100, Social Captions 10/100. | `src/portal-data.js` model fields |
| R5 | No per-item selection | One specialist = one node = one `outputText` blob. No deliverable granularity. | `portal-briefs.jsx` `buildInitialRunNodes` / `runAssembly` / `renderNode` |
| R6 | No structured output | Specialist output accumulated as freeform string; stored as `{ text }`. | `runs.js:204,323` |

## 3. Locked design decisions (from brainstorming)

- **Artifact model:** fan-out **child cards** — each specialist branches into one selectable card *per deliverable*.
- **Who sets N:** Brandolph **proposes** the count (inferred from intent), user **adjusts** before the run, credits shown.
- **Scope:** **generalize across all request types** via a typed deliverable taxonomy (social, ad, email, landing, naming, mood, **deck, blog article, key visual, carousel, newsletter, case study**, etc.), with social as the reference example.
- **Platform-aware, multi-platform:** a brief can target **several platforms at once** (IG + LinkedIn + X…); each deliverable fans out a **per-platform variant** with the correct image dimensions, copy length, and tone.
- **Platform inquiry:** Brandolph **infers** the platform when the brief states it, **asks** when absent/ambiguous, and **always surfaces it in the plan** to confirm/change.

## 4. Architecture

### 4.1 Delivery Plan (Brandolph / Sharpener output)

The Sharpener stops returning a flat `proposedSpecialists` list and returns a structured **Delivery Plan**:

```jsonc
DeliveryPlan {
  deliverableGroups: [
    {
      type: "social_post",          // from the taxonomy (§4.2)
      count: 5,                       // Brandolph-proposed, user-adjustable
      platforms: ["instagram",        // ≥1 platform; each makes a variant (§4.3a)
                  "linkedin"],
      parts: ["caption", "image"],    // each part → a specialist (§4.3)
      crew: { caption: "a16", image: "a41" }
    }
  ],
  platformInquiry: {                  // §4.1a — drives the sharpen question
    status: "inferred" | "asked" | "assumed",
    value: ["instagram", "linkedin"]
  },
  totalCr: <sum over groups of count × platforms.length × per-deliverable cr>,
  rationale: "5 posts × IG+LinkedIn = a week of cross-posted content"
}
```

Rules:
- If a group's intent implies visual output, `parts` **must** include a visual part with a real visual specialist (a19–a46). No silent text-only.
- Every group carries **≥1 platform**. Cards = `count × platforms.length` (§4.4).
- Remove the `a01–a18` constraint and the `.slice(0,3)/(0,4)` caps. Replace with a sane per-request max and the user-adjustable count.
- Backward compatible: a plan with one text-only group of `count:1`, `platforms:["generic"]` reproduces today's single-card behaviour.

### 4.1a Platform inquiry

- Brandolph **infers** the platform from the brief ("Instagram carousel" → `instagram`). `platformInquiry.status = "inferred"`.
- If absent/ambiguous, it adds a platform question to the sharpen step ("Which platforms is this for?"). `status = "asked"`.
- If the user skips, Brandolph picks a sensible default and marks `status = "assumed"`.
- The chosen platform(s) are **always shown in the plan** for the user to confirm/change before the run — same adjust affordance as count.
- Platform is per **group**, so one brief can mix (e.g. a `social_post` group for IG+LinkedIn *and* a `blog_article` group for the web).

### 4.2 Deliverable taxonomy (extensible)

Each `type` declares its default `parts`, a default crew, and which parts are **platform-sensitive** (their spec changes per platform — §4.3a). Starter set:

| type | parts | default crew (ids) | platform-sensitive | card render |
|------|-------|--------------------|--------------------|-------------|
| `social_post` | caption, image | a16 + a41 | caption, image | composite: image + caption |
| `carousel` | caption, frames[] | a16 + a41 | caption, frames | composite: frame strip + caption |
| `ad_creative` | headline, body, image | a37/a12 + a42 | all | composite: image + headline + body |
| `blog_article` | body (long-form), hero_image | a15 + a20/a21 | hero_image (web) | composite: hero image + article body |
| `deck` | outline, slides[] (heading, body, key_visual) | a36/a15 + a44/a20 | slides (16:9) | multi-slide card group |
| `key_visual` | image, concept | a20 | image | image card + concept note |
| `email` | subject, body | a14 + a13 | body (email width) | text composite |
| `email_sequence` | (N × `email`) | a14 + a13 | — | N text cards |
| `newsletter` | subject, body, hero_image | a14 + a13 + a21 | hero_image | composite |
| `case_study` | narrative, pull_quotes, hero_image | a15 + a09 + a21 | hero_image | composite |
| `landing_section` | heading, body | a12 + a17 | body (web) | text card |
| `naming` | name, rationale | a07 | — | text card |
| `tagline` | line | a09 | — | text card |
| `mood_frame` | image | a35/a21 | image | image card |
| `hero_kv` | image | a20 | image (campaign/web) | image card |
| `infographic` | spec, image | a45 | image | composite |

The taxonomy lives in one place (server + a mirrored client constant) so Brandolph, the run engine, and the canvas agree on shape. New types = one table entry. Composite types with hero/key visuals (`blog_article`, `deck`, `newsletter`, `case_study`) pair their long-form text part with a visual part on the **same** card (§4.4).

### 4.3 Specialist output contract (structured deliverables)

Text specialists return **N structured deliverables**, not a blob, driven through the existing `outputContract` hook (`compose-specialist-prompt.js:107`):

```jsonc
{ "deliverables": [
  { "slot": 1, "title": "Mon — proof post", "body": "…", "meta": { "platform": "ig" } },
  { "slot": 2, "title": "Tue — POV",        "body": "…", "meta": { "platform": "ig" } }
  // …count items
] }
```

- One copy specialist call returns **all N text deliverables** (cost-efficient — one LLM call).
- `maxTokens` fix (R2): size by **deliverable count and type**, not `cr × 100`. e.g. `base + count × per_deliverable_tokens`, clamped to a safe ceiling. No more 300-token truncation.
- Visual specialist runs **once per deliverable slot** (N cheap `fluxSchnell` gens), each image bound to its slot. This is the cost driver → capped by N (user-approved) and routed to the cheap image tier.
- **QA per deliverable** (R6): voice QA per text deliverable, vision QA per image. One weak post is flagged individually; the rest pass. The card shows its own score.

### 4.3a Platform spec table

A `platforms` registry maps each platform to the concrete spec each platform-sensitive part must hit. Single source of truth, consumed by both the copy contract (length/tone) and image gen (dimensions). Starter set:

| platform | image dims | copy length | tone notes |
|----------|-----------|-------------|------------|
| `instagram` | 1080×1080 / 1080×1350 | caption ≤ 2200 ch, hashtags | visual-first, hooky |
| `instagram_story` | 1080×1920 | minimal overlay text | vertical, ephemeral |
| `linkedin` | 1200×627 / 1080×1080 | 1–3 short paras | professional, POV-led |
| `x` (twitter) | 1600×900 / 1080×1080 | ≤ 280 ch | terse, punchy |
| `tiktok` | 1080×1920 | hook + caption | native, casual |
| `facebook` | 1200×630 | medium caption | broad |
| `blog`/`web` | hero 1600×900 | long-form | editorial |
| `deck` | slide 1920×1080 (16:9) | headline + bullets | presentation |
| `email` | hero 600 wide | scannable | direct |
| `generic` | 1080×1080 | unconstrained | default fallback |

- The platform spec is injected into the specialist prompt (`compose-specialist-prompt.js` `outputContract`) so copy is written to length/tone, and into the image gen call so dimensions are correct (a41 Social Post Designer's "by platform spec" finally gets its platform).
- Per-platform variants of the *same* slot share the underlying idea but are **re-fitted** (e.g. the IG square + the LinkedIn 1200×627 of post 1), not blindly cropped.

### 4.4 Canvas fan-out (the MOAT surface)

- New node kind `deliverable`, a child branching off its specialist node:
  `BIO → brief → [specialist] → [deliverable 1 … N]`. `CanvasHeader` stays (do not remove).
- **Multi-platform layout:** cards per group = `count × platforms.length`. Platform variants of the same slot group together — either as a small platform-tabbed card (IG | LinkedIn) or adjacent columns per platform (decided in plan). e.g. "5 posts × IG+LinkedIn" = 5 rows, each with an IG and a LinkedIn variant. Each variant is independently selectable.
- A deliverable card is a **composite** of its parts: e.g. a `social_post` card shows the image with the caption beneath; a `blog_article` card shows the hero image atop the long-form body. Pairing rule: the visual part for slot *k* binds to the text part for slot *k* of the same group **and platform**.
- Per card actions: **select ✓ · edit · export · re-run just this one** (re-run reuses `streamSpecialistRun` with a single-slot scope + `modelOverride` for a premium retry).
- Group footer: **"Export selected" / "Send selected to library"** — keep the 3 you want, discard the rest.
- Node clicks route through `onNodeClick` (canvas wrapper hijacks inner onClick — the documented gotcha). Selection toggling must not be swallowed; selection state lives above `InteractiveCanvas`.
- Fixed-height cards remain (no stacking); N child cards lay out in a column off the specialist, reusing the existing row-slot geometry.

### 4.5 Credits gate (unchanged product promise)

- Brandolph proposes `count` **and platform(s)** per group; the review step shows **count × platforms + total credits** (incl. every per-platform image gen) and lets the user dial each group's count up/down and add/remove platforms.
- Multi-platform multiplies image gens (the cost driver) — the estimate makes that explicit so the user opts in with eyes open before any spend.
- **Nothing spends until the user fires "Run — X credits"** from the canvas.
- Product surface shows **credits only** — never internal API cost (standing rule). Cost tiers live in eng docs only.

### 4.6 Model routing re-tune (R4)

- Lift the specialists with flagged scores off the weakest tier for creative work (e.g. Social Captions, Territory Mapper) to a mid tier (sonnet / gemPro) — keep cheap models for terse/QA tasks (Subject Lines, Voice QA, vision QA).
- Re-tune is data-driven off `brand_specialist_stats`; this spec authorizes the *direction*, exact per-agent routes decided in the plan with cost-at-scale in mind.

## 5. Data model

- A run can now own **multiple deliverables**. **Decision (locked): phase 1 stores a `deliverables` JSON array on the existing output row** — simpler, fewer moving parts, no new table. A child `deliverables` table (cleaner per-item history/queries) is a possible phase-2 migration if per-item querying becomes a need. Must preserve existing single-output briefs.
- The canvas `view` mode (`BriefViewCanvas`, saved briefs) must hydrate deliverables back into child cards — opening an old brief still works (back-compat: single `{text}` → one deliverable card).

## 6. Back-compat & migration

- Old single-blob runs render as a group of `count:1` → one deliverable card. No data migration required for read.
- Sharpener returning legacy `proposedSpecialists` (no `deliverableGroups`) is wrapped into a default plan so nothing breaks during rollout.

## 7. Touch points (files)

- `server/src/lib/sharpener.js` — emit `DeliveryPlan`; fix the a01–a18 / visual contradiction.
- `server/src/routes/briefs.js` — return the plan shape.
- `server/src/routes/runs.js` — structured-output parse, `maxTokens` by count/type, per-deliverable QA, per-slot image loop, output persistence.
- `server/src/lib/compose-specialist-prompt.js` — structured `outputContract` per deliverable type.
- new: deliverable-taxonomy module + **platform-spec registry** (server) + mirrored client constants.
- `server/src/lib/compose-image-prompt.js` — accept platform dimensions per gen.
- `src/portal-brandolph.jsx` — consume plan; remove `.slice(0,3)`; review UI shows per-group count + credit estimate + adjust.
- `src/portal-briefs.jsx` — `buildInitialRunNodes`/`buildInitialRunEdges` fan-out; `deliverable` node kind; composite card renderer; selection + export; `BriefRunCanvas` run loop produces child cards; `BriefViewCanvas` hydrate.
- `src/portal-data.js` — model-route re-tune for flagged specialists.

## 8. Risks & guardrails

- **Cost at scale:** image gens are the spend driver, now multiplied by `platforms.length`. Mitigation: user-approved `count × platforms` with explicit credit estimate, default sane caps per type, cheap `fluxSchnell` tier for volume, only-on-confirm. Consider reusing one base concept across a slot's platform variants (re-fit, not re-imagine) to avoid N× full-cost generations where quality allows.
- **Canvas clutter:** large N → many cards. Mitigation: column layout per group, fit-to-view, collapse group to its specialist node.
- **Don't regress:** keep `CanvasHeader`, keep `fluxSchnell` in `IMAGE_MODELS`, route node clicks via `onNodeClick`, never expose API cost.

## 9. Out of scope (this spec)

- Motion & Sound dept (still "coming soon").
- Stitch-UI companion project (paused by user).
- Multi-brand workspace changes.

## 10. Phasing (for the implementation plan)

1. **Contract + engine** — taxonomy, Delivery Plan, structured output, `maxTokens` fix, per-deliverable QA, persistence. Verify data is right (cheap).
2. **Canvas fan-out** — child cards, composite render, pairing, selection, export, view-mode hydrate.
3. **Orchestration UX** — Sharpener plan, review-step count adjust + credit estimate.
4. **Routing re-tune** — lift flagged specialists; verify against `brand_specialist_stats`.

Verification happens at the end of each phase before the next, per the user's "everything, all request types" scope held together by phased checkpoints.

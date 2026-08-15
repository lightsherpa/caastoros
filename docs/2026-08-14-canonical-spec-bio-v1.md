# CaastorOS — Canonical Spec: BIO v1.0, Discovery, Certification

**Date:** 2026-08-14 · **Status:** Phase 1 deliverable — awaiting approval before any code
**Inputs:** the Phase 0 ground-truth memo (`docs/2026-08-14-ground-truth-memo.md`) + six research briefs (brand methodology, agent consumption, discovery UX, certification systems, multilingual/RTL, failure modes).
**Locked decisions:** (1) a real `super_admin` tier above `admin`; (2) **stage-2-only gate** — self-certification unlocks engagement/briefing, human certification gates production; (3) **full EN/ES/AR parity + real RTL** now.

> This is the machine contract *and* the human documentation. The goal warns that agents scoping in isolation produce three internally-consistent systems that don't fit. §0 is the shared spine that makes these one chain; every later section hangs off it.

---

## 0. The shared spine (why this is one chain, not three features)

Five load-bearing decisions connect Discovery, the BIO, and Certification. Everything else is downstream.

1. **One canonical record, one boundary.** The BIO is a versioned record whose *shape* is defined once. Every read and every write passes through **`normalizeBio(rawPayload) → CanonicalBio`** — the single normalization/validation/upcast boundary. No renderer, agent, or route ever touches a raw `payload` again. This kills the 5-way shape drift, the Brandolph 400 crash, and makes 6-month-old BIOs readable.

2. **Provenance is the connective tissue, and it is event-sourced.** Every BIO field's value derives from an append-only **assertion log** — who asserted it, when, from what evidence, at what confidence, and whether a human confirmed it. Discovery *produces* assertions; the human reviewer *confirms* them; agents *respect* them (a field marked inferred/absent is never presented as fact, never invented). The same `{value, provenance, confidence, source, humanConfirmed}` shape flows end to end.

3. **The gate lives at the data layer, in one loader.** Assemblies are a client-side loop with no server orchestrator, so the only defensible gate is the per-run BIO loader. **`loadBioForRun`** enforces the stage-2 gate (production ⇒ human-certified snapshot); a lighter `assertEngageable` enforces stage-1 (briefing ⇒ self-certified). Neither can be bypassed via the app *or* via direct REST — which requires the security hardening in §7 to ship **in the same milestone**, never after.

4. **Language is a first-class dimension, not a translation pass.** `language-of-brief` and `language-of-output` are separate fields. Brand voice is authored natively **per locale** (`voice.byLocale`), certification is **per locale** (`cert_locales`), and RTL is a real layout property, not a mirror filter. Nothing here is a machine-translation afterthought.

5. **Determinism where it counts, honesty where it can't.** The rules engines (`scoreBio`, `evaluateCertification`, `projectBio`) are pure and byte-deterministic. LLM extraction is *not* deterministic and won't be faked into it — it is made **reproducible-by-snapshot**: the exact inputs, model id, and raw output are frozen, and everything downstream is deterministic over that snapshot.

The three BIO properties, in priority order, govern every trade-off below: **precision > depth > agent-usability.** A field that can't be made precise stays empty and flagged — an empty field is honest; a vague one silently produces generic output that looks certified.

---

## 1. BIO Schema v1.0

### 1.1 Two conventions that carry the anti-generic value

Applied schema-wide, not per field:

- **Declarative anchor + exemplar set.** Every quality-bearing field pairs a value the agent *obeys* (`[DECL]`) with an exemplar set it *imitates/avoids* (`[EX]`). Voice exemplars ("3 on-voice + 3 off-voice sentences") and imagery do/don't pairs are **`[MUST]`**, not nice-to-have — few-shot exemplars steer a generative model far harder than any adjective.
- **Rationale threading + vague-adjective guard.** Every strategic choice carries a `rationale` ("why this, not the alternative"), rendered only to reasoning specialists + the reviewer (gated out of cheap/volume specialists to protect prompt-cache economics). Every descriptive field must resolve to an enum, a measurable spec (hex/ratio/px), or an exemplar set — "modern, clean, bold" is rejected by validation as a terminal value. This is precision (priority #1) enforced structurally.

### 1.2 Section taxonomy (v1.0 MUST-have)

Full field registry is the implementation artifact (§5.1); this is the shape and the cutline. Each field tags `[DECL]`/`[EX]`/`[HYBRID]`, a `slice` (§1.4), and an `audienceTier` (which specialist tiers see it).

| Section | v1.0 MUST fields | Notes |
|---|---|---|
| `meta` | `schemaVersion`, brand/version/cert envelope, `lastReviewed`, `certValidUntil` | Envelope; provenance defaults. |
| `identity` | `essence`, `purpose`, `mission`, `promise`, `values[{value, behavioralDef, rationale}]`, `personality`, **`archetype`** (primary+secondary), `pillars[{name, definition, rationale}]`, `founded` | Archetype is the highest steering-per-token field. Values need behavioral definitions, not one-word tokens. |
| `positioning` | `statement` (Moore format, structured sub-fields), `frameOfReference`/`category`, `pointsOfDifference[{claim, proof, rationale}]`, `pointsOfParity[]`, `competitors[{name, positioning, difference}]`, `jtbd[]` (Ulwick format) | The load-bearing section. PODs need proof or agents default to parity claims = generic. |
| `audience` | `segments[{label, priority, description, jtbd, ...}]` | Upgrade from strings to rich objects; strings force every agent to re-infer the human. |
| `voice` | `attributes[{trait, means, doesNotMean}]`, `toneSpectrum` (NN/g 4-dim), **`exemplars` (3 on / 3 off)**, `signatures[]`, `lexicon{owned, avoided, forbidden}`, `grammarPerson`, **`byLocale{}`** (§4) | Richest anti-generic ROI. `forbidden` renders verbatim as a hard "never." Voice is **per-locale**, not one shared object. |
| `messaging` | `keyMessage`, `pillars[{message, proof[], rationale}]`, `proofPoints[{claim, evidence, source}]`, `valueProp`, `tagline`, `boilerplate` | Messaging house + RTBs; stops unsupported/hallucinated claims. |
| `visual` | `color[{name, hex, role, usage}]` + `contrast` (WCAG pairs), `typography[{role, family, weights, minSize}]`, `artDirection` (operationalized), **`imagery.exemplars` (do/don't)**, `avoid[]` | A *system* with misuse rules, not a mood board. Image specialists read `artDirection` + exemplars directly. |
| `goals` | `northStar`, `objectives[{horizon, goal, metric, rationale}]` | Decoupled from hardcoded `q2/q3` (which rots). |
| `governance` | `refusals[]`, `notList[]`, `watchouts[]` | The absolute constraint layer; `refusals` render verbatim. |

**v1.1+ (NICE):** brand architecture (Aaker relationship spectrum), brandPrism, categoryStrategy, valueLadder, toneByContext, voice `mechanics`, motion, layout, iconography, naming architecture, `usageRules` with counter-examples, `decisionRights` (RACI-lite: what a specialist may decide vs must escalate).

### 1.3 Event-sourced provenance (the non-negotiable)

State derives from change history, never hand-written.

- **`bio_assertions`** (append-only): `{id, brand_id, bio_version, field_path, value_json, asserted_by, asserted_role, source_ref → bio_sources(id) | null, confidence 0-100, stated_or_inferred, human_confirmed bool, created_at}`. One row per assertion of one field. A human confirming a value writes a new assertion with `human_confirmed=true` and `stated_or_inferred='stated'` — it never mutates the prior row.
- **`projectBio(assertions) → payload`** (pure, deterministic): folds the log into the current `payload` + the derived `confidence{}`, `missing[]`, and **`conflicts[]`** maps. Latest human-confirmed assertion wins; divergent unconfirmed assertions for one field produce a `conflicts[]` entry (never averaged, never silently picked — §3/§6).
- The `bios.payload` column becomes a **materialized projection** (cache of `projectBio`), not the source of truth. This is event-sourcing without a CQRS framework — one append-only table + one pure fold. `// ponytail: assertion log + materialized projection, not full CQRS — upgrade only if we need time-travel replay beyond diffing.`

### 1.4 Machine read-contract (resolves depth vs tokens)

Three tiers, served through the existing cache-block mechanism:

| Tier | Who | Content | Cache posture |
|---|---|---|---|
| **T0 CORE** | every agent + Brandolph | positioning, category, top pillars, voice register + forbidden, primary audience (1 line), northStar, global refusals, + provenance exceptions | brand-constant → **one shared cache prefix across all specialists**. Hard cap ~250 tok. |
| **T1 DEPT SLICE** | per department (today's `bioSlices`, fixed to a shared enum) | Copy→full voice; Visual→palette/type/imagery; Strategy→audience+goals+strategic; etc. | dept-constant → incremental cached segment. 150–500 tok. |
| **T2 DEEP** | the few agents whose task needs it | personas, message architecture, competitor map, narrative, tone exemplars, evidence excerpts | keyed fetch; route to Anthropic so the big read caches. 500–2,500 tok. |

- **Cache order:** `PLATFORM preamble → BIO CORE → BIO DEPT SLICE → [T2 + spec + task]`. Only the tail is volatile. Splitting CORE out (today the whole BIO varies per dept) lifts the shared cached prefix to all 50 specialists — the ~60–80% input saving is real *only* because CORE is byte-stable.
- **No vector RAG.** The BIO is bounded and sectioned; keyed section fetch is cheaper, deterministic, auditable, and cache-stable. Semantic retrieval is reserved for the unbounded scraped-evidence corpus only.
- **Provenance as exceptions, not a map:** inject only low-confidence inline markers (`Founded: 2021 (inferred — low confidence)`) + a gap line from `missing[]` (`The BIO does not contain voice.forbidden — do not invent it`). Everything unflagged is stated fact. `computeAgentProvenance(canonicalBio, slice)` sits beside the human-facing `computeFocus`.
- **The single agent-facing read:** `getBioForAgent({ bio /* normalized */, audience: 'brandolph'|'specialist', dept, outputLocale, deepFields=[] }) → { blocks[] }`. Replaces both `renderBioLayer` and the ad-hoc slice logic; both Brandolph and specialists go through it, null-safe post-`normalizeBio`.

### 1.5 Versioning & diff

- `payload.schema_version` (string), orthogonal to `bios.version` (per-brand content revision). Additive-only within a major; new fields optional with defaults; upcasters in `normalizeBio` map old→current in memory (warn-not-throw on read, so an old BIO never hard-fails).
- Certification attaches to a specific `bios.version` (already true). A newer *uncertified* version must never supersede an older *certified* one on the production path (§3, §6 I7).
- Diff falls out for free: after `normalizeBio`, any two versions share a shape → field-level diff is trivial. `bios.version` history is retained (already append-only).

---

## 2. Discovery Flow Map

Legend: **[H]** human · **[A]** agent-extraction · **[I]** inferred (must be confirmed) · **[EXIT]** durable leave-and-return.

```
S1 POINT [H]          brand name (add-brand) · primary URL · IG · uploads (3 buckets)
   │                  ⚠ do NOT mutate brands.url or write bio_sources until the session commits
   ▼
S2 READING [A]        live extraction; [EXIT "notify me when ready"] → notify() on completion
   ▼
S3 DRAFT HUB [I+H]    chapter map (replaces the CI_DISCOVERY mock). Per chapter: status chip
   │                  (well-sourced ≥85 / filling-in 65-84 / needs-sources <65 via scoreBio),
   │                  #gaps (computeFocus), #inferred-to-confirm. [Review][Delegate ▸][Skip]
   │                  Global: [Save & finish later] on every screen.
   ▼
S4..S11 CHAPTERS [I→H]  one BIO section per screen, 3–5 fields. Agent value shown as a DRAFT.
   │                  Each inferred field: amber "confirm — inferred, not stated" + provenance
   │                  badge; missing → amber "we couldn't find this", never a guessed value.
   │                  Per field: [Looks right ✓ attest][edit][where'd this come from?][leave blank—flag]
   ▼
S12 CONFIRM & ATTEST [H]  self-cert: accurate/aspirational split per material field + 3 versioned
   │                  statements → writes bio_attestation → UNLOCKS briefing immediately.
   │                  Files the onboarding steward_job (human cert lands async, separate chip).
   ▼
S13 LIVE             BIO on #/bio; steward cert chip pending→certified (existing live poll).
```

**Structural moves vs today:**
1. Replace the mock Confirm screen (`portal-discovery.jsx:448-757` rendering `window.CI_DISCOVERY`) with S3 Hub + S4–S11 chapters rendered from the **live** `payloadToFields` mapper (already exists at `:862-916`) + `computeFocus`.
2. **Draft lane** — new `discovery_sessions` table (one active per brand: cursor, chapter_status, attested marks, delegations, `draft_payload`) + `bios.status ∈ (draft|candidate|certified)`. Debounced autosave (~800ms + on blur/chapter-exit) writes the draft **without** versioning or enqueuing a steward job. Only S12 attest promotes draft→candidate (version bump + `onboarding` job). This gives save/resume and kills the orphan-`bio_sources`/mutated-`url` abandonment bug.
3. **Delegation** — chapter-scoped magic link (`discovery_delegations{session_id, brand_id, chapter, invitee_email, token, status}`) opening a single-chapter scoped view; owner keeps the final attest (single accountable signer). Reuses `notify()`/Realtime; no seat model.
4. **Evidence made functional** — ship the `DISCOVERY_V2` read path so uploads/IG/visual actually feed synthesis (today stored and ignored). Evidence raises confidence and shows a **diff** ("Positioning updated from your deck"), never clobbering an attested field.
5. **Inferred ≠ stated everywhere** — a value is not "fact" until a human attests; attesting lifts its confidence to a human-stated ceiling for `scoreBio`.

**Abandonment/interruption:** the draft lane never touches the certified BIO specialists read; killing the session at any step loses nothing and corrupts nothing (§6 I1). GC sessions with no attest after N days.

**i18n:** intake locale flows into synthesis so `voice.forbidden`/`refusals` are authored in the brand's language (§4); chapter UI uses logical properties for RTL; `industries` gains `label_ar` (today `label_en/es/it`).

---

## 3. Certification Model (two stages)

### 3.1 Stage 1 — Self-certification (client attestation, instant briefing unlock)

A legal + accuracy attestation by the brand owner. Zero Steward identity. Gates briefing only.

- **What the client attests:** a per-field **accurate-vs-aspirational** split on every material field (`accurate/factual` for verifiable claims like `identity.category`, `voice.forbidden`; `aspirational/directional` for `goals.*`, aspirational positioning). This split is the thing that makes self-cert meaningful without a human — it separates *what is true* from *what they want to be true*, and becomes a Stage-2 input (an "accurate" field the Steward can't verify is a red flag).
- **Preconditions (all pure, reuse existing fns):** no `computeFocus` `missing` items among importance ≥1.0 fields (positioning, forbidden, primary audience); `scoreBio ≥ selfCertMinScore` (config, ~55–60); split completed; three versioned checkbox statements (authority to represent · content reflects the brand · aspirational fields marked).
- **Record:** `bio_attestations` (append-only) bound to `bio_id` + `payload_hash` (sha256). Any edit → new version → hash mismatch → self-cert auto-lapses. Denormalized `bios.self_certified` + `self_certified_at` for fast gating.
- **Unlocks:** Brandolph brief authoring, sharpener, brief creation, assembly *proposal*. **Does NOT unlock:** production runs, human craft, the "certified by {Steward}" chip. Distinct provenance chip: *"Self-attested by {client} · pending human certification"* — never a team_member name. (Read-only Brandolph Q&A is allowed pre-self-cert; only BIO-derived brief/production output is gated. ⚠ confirm this boundary.)

### 3.2 Stage 2 — Human certification (analytic rubric, config-driven pure engine)

Anchored analytic rubric (CMMI-style levels + BARS to cut reviewer variance). Each criterion scored 0–4 (Absent→Exemplary), weighted → 0–100 composite → decision band. **Gating criteria have hard floors** — the composite alone can never approve if a gate fails (high-blast-radius fields clear an absolute bar, never averaged away).

| # | Criterion | Source | Weight | Gate |
|---|---|---|---|---|
| C1 | Coverage completeness | `scoreBio` coverage (auto) | 0.15 | floor≥2 |
| C2 | Evidence grounding | `scoreBio` avgConf+diversity (auto) | 0.15 | — |
| C3 | High-importance field integrity | `bioFocus` ≥1.0 items, human | 0.25 | **floor≥3** |
| C4 | Positioning distinctiveness | human, anchored | 0.15 | — |
| C5 | Voice fidelity | human, anchored | 0.10 | — |
| C6 | Internal consistency (no contradictions) | human, anchored | 0.10 | floor≥2 |
| C7 | Strategic soundness | human, anchored | 0.10 | — |

- **Bands:** approve ≥80 · approve_with_conditions 68–79 · return_changes 50–67 · reject <50; any gate failure caps at return_changes (reject if a gate is 0). Human criteria carry a reviewer-confidence 0–2; low confidence on a gating criterion forces calibration.
- **Config is data, not code:** `cert_rubric_versions` table (one `active`, edited from `portal-admin.jsx` like specs, version-history UI reused). The route loads active config and passes it in; `rubric_version_id` pinned on every decision.
- **Pure engine:** `evaluateCertification({ bioPayload, autoSignals, reviewerScores, rubricConfig }) → { composite, band, gateFailures[], recommendedDecision, breakdown[] }` — third pure module beside `scoreBio`/`bioFocus`, no I/O.

### 3.3 Decision states, transitions, defensibility

- Extend `steward_jobs.status` with `changes_requested`, `rejected`, `decertified` (keep `completed` for both approve variants). Add columns `decision`, `conditions`, `required_changes`, `reject_reason_code`, `rubric_version_id`, `composite_score`.

| Decision | certified | Briefing | Production | Notes |
|---|---|---|---|---|
| approve | true | ✓ | **✓** | chip + drift cadence start |
| approve_with_conditions | true | ✓ | ✓ (optionally dept-scoped) | `conditions[]` shown; can gate a dept (e.g. hold Visual until real logo) |
| return_changes | false | ✓ (self-cert) | **blocked** | `required_changes[]` tied to fields; edit → new version → new job |
| reject | false | ✓ | **blocked** | terminal; `reject_reason_code` mandatory; escalate to lead/super_admin |

- **Defensibility:** append-only **`cert_decisions`** (one row per decision *event*, incl. each calibration re-review): actor+role, decision, rubric_version, composite, per-criterion scores+anchors, gate_failures, **auto_signals snapshot + payload_hash**, focus addressed/unaddressed, conditions/required_changes/reject_reason, required narrative. Client-facing "why" is a deterministic render of band + lowest-scoring high-impact criteria + conditions — no engineering/cost/model detail leaks (credits-only rule).
- **Consistency:** BARS anchors (primary lever) + keep the calibration gate (`pending_lead_review`) + blind dual-review on ~10–20% sample → Cohen's/Fleiss' κ + Krippendorff's α (promote a Steward off mandatory calibration at κ≥0.6) + a gold-standard reference set + super_admin spot-audits.

### 3.4 Decertification, drift & in-flight work (explicit)

- **Re-open triggers** (each enqueues `drift_check`): client edit (new uncertified version; prior certified stays on production path), **TTL staleness** (`bios.cert_valid_until = certified_at + certTtlDays`), volume drift (N outputs since cert).
- **Decert authority:** lead_steward proposes / super_admin finalizes. Writes `status='decertified'` + `certified=false` + a `cert_decisions` row (mandatory reason + narrative + actor).
- **In-flight policy:** completed outputs keep their `certified by {Steward} · BIO vN` chip **forever** (provenance immutable); `running` jobs **finish** (they pinned `bio_version`; killing wastes credits); `queued` + all new runs **blocked immediately** (client banner + notify); **briefing stays up** (self-cert still valid). Resuming production requires re-certification.

### 3.5 Roles & separation of duties

- `super_admin` **new** — add to `users.role` CHECK; `requireSuperAdmin` layered above `requireAdmin`. Semantics: **admin** = platform/spec + rubric-config custodian; **super_admin** = review-hierarchy authority + cross-tenant ops + decert finalizer; **lead_steward** = calibration + decert proposer. (`team_members.roles[]` still holds steward/lead_steward/craft.)
- **Rotation (build the TODO):** a Steward never certifies a brand they craft on — exclude crafters from assignment eligibility (`assign-steward.js`), fall through to the existing Lead fallback + `override_reason`.
- **Four-eyes:** self-cert = brand-owning client only; human-cert = steward/lead, never the client, never on a brand they craft; enforce `lead_reviewed_by ≠ certified_by`; super_admin spot-auditor ≠ original certifier.
- Enforced at three layers: pre-assignment filter, route guard, **and DB (RLS/grants/trigger)** — because the app route alone is bypassable via REST (§7).

Full role×capability matrix: research brief 4 §8 (carried into implementation).

---

## 4. i18n / RTL / Arabic (cross-cutting)

Two tracks kept separate: **(A) product UI**, **(B) generated brand output**.

- **SPA i18n:** LinguiJS (`@lingui/core`+`react`+`vite-plugin`). ICU MessageFormat → correct Arabic 6-category plurals (a hand-rolled ternary is wrong for AR); macros wrap existing inline English strings in place → auto-extract to `src/locales/{en,es,ar}/messages.po`; lean runtime, lazy per-locale load. **Locale = app state + `<html lang/dir>`, never a route** (fits hash routing); persist to localStorage like the existing tweaks, plus to the user/workspace for a durable preference. Codebase/comments/commits stay English; only catalog values + generated output localize. Admin/dev strings stay English.
- **RTL — mechanical (≈80%):** single `<html dir>` source of truth; physical→logical-property codemod (CSS in `portal.css` is small; the real cost is inline JSX `style={}` — 71 sites in `portal-briefs.jsx` alone — via React's `paddingInlineStart`/`marginInlineEnd`/`insetInlineStart`/`textAlign:'start'`), guarded by an ESLint rule; numerals/dates via `Intl` (`numeralSystem: 'latn'|'arab'` per-brand token, `latn` default); directional-icon mirroring as an opt-in `[dir=rtl] .icon-directional{transform:scaleX(-1)}` class (never flip logos/media/checks); `<bdi>`/isolates for mixed AR+Latin.
- **RTL — the one design decision:** the **InteractiveCanvas (the MOAT).** Chrome (CanvasHeader, dept chips, panels) follows `dir`; the **spatial node graph stays LTR-coordinate** (mirroring a coordinate space breaks `setPointerCapture` math + connector geometry); node text renders `dir="auto"`. ⚠ needs explicit sign-off — not a blind flip.
- **Arabic typography:** IBM Plex Sans Arabic (OFL, the purpose-built sibling of the Plex family already in the stack; 8 weights) — self-hosted + subset woff2, `font-display:swap`, with a **`unicode-range` cascade** so one stack auto-routes Latin→Inter, Arabic→Plex Arabic (critical for mixed bidi). Token block under `[lang=ar],[dir=rtl]`: swap `--font-*`, bump `line-height` ~1.7, and **zero the negative letter-spacing** the display utilities apply (invalid for connected Arabic script). Fallback tier: Readex Pro → Noto Naskh Arabic. Move off the render-blocking Google `@import` regardless.
- **Native authoring (track B — the strategic core):** brand output is **transcreated natively per locale, never machine-translated.** Voice/naming/taglines/manifesto/headlines/captions are generated *directly in the target language from that language's BIO voice*. So `bio.voice → { base, byLocale: { en, es, ar } }` (register, rhythm, forbidden, signatures don't transfer; Arabic forces MSA vs Khaleeji vs Egyptian). Certification is **per-locale** (`bios.cert_locales[]`; an AR voice needs a market-fluent senior certifier — an operational/hiring dependency). QA per-locale: `qa-voice.js` scores AR against `voice.byLocale.ar`; `qa-vision.js` gains an Arabic-shaping check (connected glyphs, RTL).
- **Data-model language dimension:** `brands.default_locale/output_locales/numeral_system`; `bios.locales/cert_locales` + `voice.byLocale`; `briefs.brief_lang` **and** `output_locales` (never assumed equal); `runs.output_locale` (pinned for reproducibility); `outputs.locale` (**one row per locale** — keeps canvas language toggle + per-locale QA independent).
- **MENA cultural:** Hijri alongside Gregorian; Ramadan/Eid as the commercial peak for any timing specialist; RTL layout semantics (timelines, arrows, carousels, chart reading R→L); imagery modesty varies **by market** (never treat "Arab" as monolithic) — fed as per-market constraints into visual specialists + vision QA.

---

## 5. Architecture & Contracts

### 5.1 Module ownership (prevents overlapping edits in Phase 2)

| Module | Owns (files) | Provides |
|---|---|---|
| **M-schema** | new `server/src/lib/bio-schema.js`, field registry | `CanonicalBio` type, `normalizeBio`, `projectBio`, field registry (slice/label/renderAs/audienceTier) |
| **M-rules** (pure, no I/O) | `score-bio.js`, `bio-focus.js`, new `evaluate-certification.js` | `scoreBio`, `computeFocus`, `computeAgentProvenance`, `evaluateCertification` |
| **M-read** | `load-brand-bio.js`, `compose-specialist-prompt.js`, `prompt.js` | `getBioForAgent`, `loadBioForRun` (the gate), `assertEngageable` |
| **M-discovery** | `portal-discovery.jsx`, `routes/discovery.js`, `inngest/compile-bio.js`, discovery tables | draft lane, intake, evidence/V2, delegation |
| **M-cert** | `routes/steward.js`, `assign-steward.js`, cert tables | two-stage flow, rubric application, decisions, decert |
| **M-i18n** | `src/locales/*`, `ds-tokens.css`, codemod, `sharpener.js` locale routing | Lingui setup, RTL migration, font tokens, language fields |
| **M-security** | new hardening migration, `middleware/auth.js`, upload validation | RLS/grant retrofit, Storage RLS, file/SSRF validation, `super_admin` + `requireSuperAdmin` |

**Shared types (the contracts no one forks):** `CanonicalBio` (M-schema, imported by all); the assertion event shape (M-schema); `loadBioForRun`/`getBioForAgent` signatures (M-read); the rubric config shape (M-rules ↔ M-cert). The registry moves off the `src/portal-data.js` browser-eval mock into a server-authoritative module (M-schema/M-read) so the slice enum is shared and the `eval` hazard is gone.

### 5.2 The single read interface (every downstream agent uses this)

```
normalizeBio(rawPayload) -> CanonicalBio          // every read AND write; upcasts; warn-not-throw
projectBio(assertions)   -> { payload, confidence, missing, conflicts }   // pure fold of the event log
getBioForAgent({ bio, audience, dept, outputLocale, deepFields }) -> { blocks[] }   // null-safe, cache-ordered
loadBioForRun({ workspaceId, brandId, tier: 'production' })  -> certified snapshot | throw BIO_NOT_CERTIFIED(409)
assertEngageable({ workspaceId, brandId })                   -> self-certified | throw NOT_SELF_CERTIFIED(409)
evaluateCertification({ bioPayload, autoSignals, reviewerScores, rubricConfig }) -> decision breakdown
```

Contract guarantees: (1) no renderer touches raw `payload`; (2) CORE is brand-constant across all agents (max cache reuse); (3) the production path can only load a certified snapshot; (4) provenance rides inside cached blocks as cheap exceptions; (5) the slice vocabulary is one shared enum.

---

## 6. Acceptance-Test Plan (business outcomes, not endpoints)

Written before the build; each is a pass/fail business assertion.

**Gate & integrity**
- An uncertified BIO **cannot** produce a production output through *any* path (app assembly, direct `/api/runs/stream`, craft, replayed request). No output, no credit debit.
- A brand with **no BIO** gets an explicit 409, never a fictional stand-in (Vinilo).
- A **self-certified** BIO can create briefs/sharpen but **cannot** run production until human-certified.
- Editing a certified BIO does **not** change what production reads until re-certified; the prior certified snapshot keeps serving.

**Determinism & defensibility**
- Identical discovery inputs → **byte-identical** `scoreBio` and `evaluateCertification` output (golden-fixture + property tests; VCR-replayed extraction).
- All BIO write paths call the **same** scorer (regression catches the hardcoded-75 bug).
- Every certification decision reconstructs from its `cert_decisions` record (band + criterion scores + snapshot hash) with no human reconstruction.

**Discovery robustness**
- Kill the session at every step → nothing corrupts, nothing half-writes, resume lands on the same cursor.
- Contradictory answers → a `conflicts[]` entry + reviewer flag, **never** a silent average.
- An agent-inferred value never appears as stated fact anywhere an agent or the client reads it, until a human attests.

**Certification model**
- Each decision state unlocks/blocks exactly per §3.3; approve-with-conditions can gate a single department.
- Decertification blocks queued/new production immediately, lets running finish, keeps completed chips, keeps briefing up.
- No one can self-cert **and** human-cert the same brand; a Steward cannot certify a brand they craft on.

**i18n / RTL**
- Every screen renders correctly in Arabic RTL (chrome mirrored; canvas per §4), not just the ones someone remembered.
- A brand briefed in ES can produce AR output; `voice.forbidden` for a Spanish brand is in Spanish.
- Arabic text shapes (connected glyphs, no tofu) with the certified font; negative tracking is absent under RTL.

**Security (see §7 for the attacks)**
- A scripted `authenticated`-role REST client **fails** to: set `bios.certified=true`, insert a positive `ledger` row, flip `qa_results`, complete a `steward_jobs` row, or read another tenant's BIO/evidence.
- CI invariant: no `public` table without RLS + ≥1 policy.

---

## 7. Threat Model

**Root cause (corrects the Phase-0 note):** `grants_and_admin_rls.sql:26,31` grants ALL to `anon,authenticated` on every table; a `for all USING(X)` policy with no `WITH CHECK` reuses `X` (tenancy) as the write-check — so **adding `WITH CHECK` identical to `USING` fixes nothing**; writes are checked against tenancy, never column values. The fix is the `notifications.sql:33-34` pattern: `revoke insert,update,delete from anon,authenticated` + narrow `grant update(col)` where clients legitimately edit.

| Class | Attack | Control |
|---|---|---|
| **Gate bypass** | Call `/api/runs/stream` directly on an uncertified BIO (gate is `requireCertified:false` everywhere; strict loader dead) | Enforce stage-2 inside `loadBioForRun`, sole loader on every production/craft route; re-check cert between assembly steps; abort in-flight on decert (cert epoch check) |
| **Forged cert** | `PATCH /rest/v1/bios {certified:true}` via anon key + JWT | Make `bios.certified*`/`score` non-writable by `authenticated` (revoke+narrow-grant); defense-in-depth behind the app gate |
| **Forged money** | Insert positive `ledger.credits` rows via REST (balance = `-sum(credits)`) | `ledger` read-only to clients; all writes service-role |
| **Forged QA/output/queue** | Flip `qa_results`, rewrite `outputs`, complete `steward_jobs`, skip calibration | Same revoke+narrow-grant across `runs/outputs/qa_results/steward_jobs/bio_sources` |
| **Tenant read** | Cross-account BIO/evidence read | Preserve tenancy RLS on all tables (CI invariant); restrict `team_members` public directory to non-sensitive fields |
| **Evidence file access** | Reuse a leaked **1-year** signed URL; no Storage RLS | Storage RLS on `bio-sources` scoped to workspace; **short-lived** per-request signed URLs; enforce the `workspaceId/brandId` path prefix in policy |
| **Reviewer authz / SoD** | Certify own brand; Lead self-cert skips calibration; direct-write skip | Reject cert when reviewer owns/crafts the brand; four-eyes; enforce at DB, not just route |
| **Prompt injection** | Malicious uploaded doc steers the compiler + inflates self-graded confidence → inflates score → biases reviewer | Treat uploads/scrapes as untrusted data (delimit, ignore in-doc instructions); **decouple score from LLM confidence**; provenance rendering + human Steward as backstop |
| **Upload DoS / SSRF** | Any content-type/size buffered whole; client-inserted `bio_sources.raw_ref` fetched by Firecrawl | MIME allow-list + size cap (stream); `bio_sources` writable only service-role; fetch only self-minted URLs; block `file://`/RFC1918/`169.254.169.254` |
| **PII / GDPR** | No retention/export/deletion story | Data-map every field; retention windows + short signed URLs; per-subject export; **deletion = anonymize/tombstone** preserving aggregates + cert audit (never hard delete) |

**Determinism testing (with an LLM in the loop):** deterministic layer = golden-fixture byte-match + property tests on `scoreBio`/`evaluateCertification`/`projectBio`/input-assembly ordering; probabilistic layer = VCR record/replay of the compiler so CI is hermetic; quality drift = a separate, **non-blocking** staging job comparing live extraction to fixtures by semantic-similarity threshold (a model upgrade must not red the deterministic build).

---

## 8. Proposed Milestone Sequence (Phase 2 — for approval with this spec)

Each milestone ends working end-to-end, with migrations, realistic seeds (multiple brands across EN/ES/AR, completion + certification states incl. a decertified one), tests covering business rules, and README updates. Sequenced against the ground-truth memo so security ships *with* the gate.

- **M0 — Schema & rules foundation.** `bio-schema.js` (`normalizeBio`/`projectBio`/registry), `bio_assertions` table, migrate registry off the browser mock, one scorer everywhere (remove hardcoded 75), fix `renderBioLayer` null-safety. *Unblocks everything; no user-visible change.*
- **M1 — The gate + security hardening (together).** `loadBioForRun`/`assertEngageable` on all paths; RLS revoke+narrow-grant retrofit; Storage RLS; `super_admin` role; upload/SSRF validation. Remove the Vinilo fallback (409). *The stage-2 gate becomes real and unforgeable.*
- **M2 — Two-stage certification.** `bio_attestations`, self-cert attestation UX, `cert_rubric_versions` + `evaluateCertification`, decision states, `cert_decisions` audit, rotation SoD, decert + TTL. *Certification is defensible and consistent.*
- **M3 — Discovery rebuild.** Draft lane (`discovery_sessions`, `bios.status`), S3 Hub + chapters off live BIO, self-cert at S12, ship `DISCOVERY_V2`, delegation. *Onboarding produces a real, deep, resumable BIO.*
- **M4 — Deep schema + agent read-contract.** T0/T1/T2 read model, `getBioForAgent`, provenance-as-exceptions, L2 anti-invention guardrail, field-registry render. *Depth reaches agents within the token budget.*
- **M5 — i18n/RTL/Arabic.** Lingui + catalogs, logical-property codemod + ESLint guard, Arabic fonts, `voice.byLocale`, `cert_locales`, language data-model, per-locale QA, canvas RTL decision. *EN/ES/AR parity.*

M0→M1 are the correctness spine and should not be reordered. M2–M5 order is a proposal — open to resequencing.

---

## 9. Decisions (resolved 2026-08-15)

1. **Briefing gate boundary — RESOLVED (proposed default).** Read-only Brandolph Q&A allowed pre-self-cert; brief authoring/sharpening requires self-cert; production requires human-cert.
2. **InteractiveCanvas RTL — RESOLVED (advised).** Three layers, three rules: (a) canvas **chrome** mirrors via logical properties; (b) the **spatial coordinate system stays LTR** (x-right) — never `scaleX(-1)` the container, which would mirror node text/images, invert hit-testing, and break `setPointerCapture` math; (c) **node internals** use `dir="auto"` + logical properties, and **RTL reading order** for *sequential, auto-arranged* content (delivery-plan steps, storyboard frames, connector flow) is computed at the **layout layer** (node x-positions R→L, arrowheads mirrored as data) — never via a viewport transform. Free/user-dragged arrangements stay absolute. Phasing: ship chrome-mirror + node `dir=auto` first; R→L auto-arrange is a per-canvas-type follow-up. `// ponytail: handle specific sequential canvas types explicitly — no general "mirror any layout" engine.`
3. **Per-locale certification staffing — APPROVED.** Arabic voice certification requires a market-fluent senior certifier; tracked as an M5 operational/hiring dependency.
4. **Event-sourcing depth — RESOLVED (lean shape).** Append-only `bio_assertions` + pure `projectBio`; not a full CQRS/time-travel framework.
5. **Existing brands at M1 cutover — APPROVED.** Auto-grant self-cert to currently-running brands (briefing keeps working); new production requires human-cert. No running design-partner production is interrupted.
6. **`gptimage` fake alias & the 5 unimplemented-vendor "live" specialists — deferred to a separate cleanup** (out of scope for this spec; tracked so they don't silently mislabel capabilities).
```

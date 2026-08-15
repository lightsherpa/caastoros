# CaastorOS — Ground-Truth Memo (Phase 0)

**Date:** 2026-08-14
**Scope:** The BIO, the Brand Discovery flow, and the two-stage Certification gate — as *actually built*, not as documented.
**Method:** Five parallel read-only inventory agents over `src/`, `server/src/`, `supabase/migrations/`, `docs/`, root `*.md`, the `caastor-marketing` skill, and the design tokens. No code was changed.

> This memo is the authority for Phase 1. Where a 2026-05/06 plan and the code disagree, **the code + `IMPLEMENTATION_LOG.md` + `SESSION-STATE.md` are current truth**; the plans are original intent.

---

## 0. Executive summary — the findings that reframe the engagement

1. **The certification gate does not exist as a gate.** Enforcement is a single query flag `requireCertified`, and it is `false` at every live call site (`runs.js:73`, `brandolph.js:39`, `briefs.js:26`). The strict loader `loadBioForRun` (throws `BIO_NOT_CERTIFIED`) is **defined but never called**. An uncertified BIO — or *no* BIO — physically reaches every specialist run and assembly today. This is deliberate ("cert is a trust signal, not a hard gate" — `ship-to-design-partners-plan.md:211`), not accidental. **The Phase-2 non-negotiable "gate enforced at the data layer" is essentially greenfield-to-enforce.**

2. **The two-stage model (self-cert → engagement, human-cert → production) does not exist.** There is exactly one boolean `bios.certified`. No `self_certified`, no engagement/production split. Both stages are net-new.

3. **The BIO is a loose `jsonb` blob, not a schema.** Only version/score/certification are real columns; all semantic content lives in an unvalidated `payload`. Its shape is defined *by example* in **5+ places that already disagree** (`vinilo.js`, `compile-bio.js` schema, `score-bio.js`, `bio-focus.js`, the two renderers) on `ownership`, `audience.tertiary`, and which sections are mandatory.

4. **Invented brand data is live in the production path — the exact failure this product exists to eliminate.** `load-brand-bio.js:61-73` silently returns the fictional **Vinilo Coffee** BIO for any brand with no BIO row. And the 55 L2 specialists lack the "do not invent brand attributes" guardrail that only L1 Brandolph carries (`prompt.js:93`), sitting on a composer that silently omits missing fields.

5. **Provenance exists but is shallow and ungrounded, and never reaches an agent.** There's a `payload.confidence["section.key"] = {conf, source}` map, but `source` is free text the model invents — no who, no when, no foreign key to `bio_sources`, no per-field human-confirmed flag, no event history. Worse, **both serializers strip `confidence`/`missing`** before injecting the BIO — agents receive every value as a flat asserted fact with zero uncertainty signal. The goal's "event-sourced with provenance" is a rebuild.

6. **Discovery's onboarding is a demo shell over a real backend.** The "Confirm" screen renders hardcoded Vinilo mock data (`portal-data.js:714`), **not the user's compiled BIO**; there is no save/resume; and uploads, Instagram, and all visual extraction are dark behind `DISCOVERY_V2` (default OFF). The real, editable BIO lives on a *separate* `#/bio` surface. The server write path (`compile-bio.js` → `bios`/`bio_sources`/`steward_jobs`) is, by contrast, solid.

7. **i18n / RTL / Arabic is 100% greenfield, and the shipped design default contradicts the brand.** No i18n library, no locale files, `lang="en"` hardcoded, zero `dir=`/logical properties, and **no Arabic-capable font** loaded (Inter Tight / Geist / IBM Plex Sans Condensed all lack Arabic glyphs). Separately, the app ships **light theme + Inter Tight** while every brand authority mandates **dark-first + IBM Plex Sans Condensed**.

---

## 1. The chain, link by link

The goal insists these are one chain, not three features. Here is the real state of each link:

```
Discovery ──▶ BIO draft ──▶ [self-cert gate] ──▶ engagement/briefing ──▶ [human-cert gate] ──▶ production (assemblies)
  demo         real, but      DOES NOT            no gate today          DOES NOT              no gate today
  shell        loose blob     EXIST                                      EXIST
```

- **Discovery → BIO:** real and idempotent server-side; the UI around it is largely demo scaffolding (§3).
- **BIO → self-cert:** the self-cert stage is not built at all (§4).
- **engagement/briefing → human-cert → production:** one boolean `certified`, written and displayed, **never enforced** on any run path (§4). Assemblies are a **client-side loop** hitting `/api/runs/stream` — there is no server-side assembly runner, so any "gate" must live in the per-run loader, which is exactly the disconnected wire.

---

## 2. BIO — schema, storage, provenance, versioning, serialization

**Storage.** `bios` (`init.sql:105-119`): real columns are `version int`, `payload jsonb`, `score int`, `certified bool`, `certified_by`, `certified_at`, `steward_notes`, `cert_kind ∈ {onboarding,drift_check,re_extract}`, `unique(brand_id, version)`. `bio_sources` (`init.sql:124-134`) is the raw-intake log (kind/bucket/src/signals) and is **not** linked to individual BIO fields. Brand-global `refusals text[]` lives on `brands`, not in the payload.

**Payload shape (by example only, no validation).** identity{positioning, category, founded, pillars[], (ownership — Vinilo-seed only, never populated), (name — from brands.name)}, audience{primary, secondary, tertiary, jtbd[]}, voice{register, rhythm, forbidden[], signatures[]}, visual{palette[{hex,name}], type[{kind,family}], imagery[], avoid[]}, goals{northStar, q2, q3}, strategic{watchouts[], notList[]}, plus compiler-only siblings confidence{}, missing[], refusals[].

**Populated vs empty in reality.**
- Text sections populate from scrape via Gemini 2.5 Pro (`compile-bio.js:38-44`).
- **`visual{}` is perpetually empty on a stock deploy** — palette/type/imagery/avoid populate only when `DISCOVERY_V2=1` (`compile-bio.js:29,83-88,268-296`). Brandolph renders blank visual lines for every real brand.
- `confidence`/`missing`/`refusals` are always-on for freshly compiled BIOs but **absent from legacy BIOs and the Vinilo seed**.

**Provenance / confidence.** Shallow `{conf:0-100, source:"<free text>"}` sibling map (`compile-bio.js:93-97`). **No WHO, no WHEN, no evidence FK, no human-confirmed-per-field flag, no event sourcing.** The only event log is `brand_signals` (specialist run outcomes, not BIO fields). Certification is whole-row; `bio-focus.js` ranks which fields a Steward should check but the certify action stamps the entire version. Steward edits **hardcode `score=75`** (`steward.js:219`), discarding the deterministic `scoreBio`.

**Versioning.** Append-only, real: `unique(brand_id, version)`; every producer inserts `max+1`; `runs.bio_version` is pinned per run (`runs.js:211`) for reproducibility. **No diff is computed anywhere.** Cert columns sit on the specific version, so cert *is* version-attached — **but** the loader always takes `order(version desc).limit(1)` and only filters `certified=true` when `requireCertified` is set (never), so **a newer uncertified version supersedes an older certified one at read time**, contradicting the in-code contract at `load-brand-bio.js:98-102`.

**Serialization (token shape).**
- **Brandolph — `renderBioLayer` (`prompt.js:44-86`):** emits the **entire BIO every request** (~500-700 tokens for a full BIO), `cache_control:ephemeral`. **Not null-guarded** — a payload missing `visual`, `identity.pillars`, `audience.jtbd`, `voice.*`, or `strategic.*` throws and **400s the endpoint** (`brandolph.js:44`). The happy path holds only because the seed + compiler emit all sections; there is no normalization enforcing it.
- **Specialists — `renderBioSlice` (`compose-specialist-prompt.js:48-96`):** per-department subset via `spec.payload.bioSlices` (Copy→voice/forbidden; Visual→palette/type/imagery; Concept→positioning/audience; etc.); identity always included; fully `?.`-guarded (degrades silently).
- **Neither serializer emits `confidence`/`missing`/`source`.** All uncertainty is discarded before the model sees the BIO.

---

## 3. Discovery flow

**Shape:** a 3-screen wrapper (Connect / Extract / Confirm) around one real server action.

- **Step 1 "Connect"** (`portal-discovery.jsx:176-347`) — the only real input. Brand name (new-brand only), primary URL **pre-filled with `"vinilo.coffee"`** (`:182`), Instagram handle, three-bucket file uploader. Submit → `POST /api/brands` (if new) → `POST /api/discovery/start` → **then** uploads files (fire-and-forget, *after* the discovery event already fired — a documented race, `compile-bio.js:174-178`). Inert buttons: "Start from scratch", "Clone a space".
- **Step 2 "Extract"** (`:349-446`) — cosmetic time-based progress bar; real logic polls `GET /api/bios/:brandId` every 3s and advances when a higher version appears, with a **90s fallback that advances even on failure**.
- **Step 2 "Confirm"** (`:448-757`) — **renders `window.CI_DISCOVERY`, a static Vinilo mock** (`portal-data.js:714`), not the user's BIO. "91 confidence", palette hexes, the license flag — all fixed demo data. Only the cert chip is live. "Activate brand space" → client-only state change, **no server write**. "Save & review later" is inert.
- **Step 3 "Live"** (`:759-776`) — hardcoded Brandolph monologue → `go("home")`.

**Server write path (solid):** `discovery.js` → Inngest `compile-bio.js` (retries:2): scrape (Firecrawl; single homepage by default, ≤6 pages in V2) → synthesize (Gemini 2.5 Pro, conservative "leave empty + add to `missing`, never invent" — `compile-bio.js:48,96`) → write append-only `bios` row with `scoreBio`, `certified:false` → enqueue `steward_jobs{kind:onboarding}` + `assignSteward`. **This is the real, honest half of the system.**

**Absent capabilities:** save/resume (nothing persisted mid-flow; remount resets to step 1), delegation to a colleague (none), and — by default config — evidence content actually reaching the BIO (uploads + IG are stored but only *read* under `DISCOVERY_V2`). The BioViewer "Upload document" button inserts a literal placeholder string, not a file (`:1569`).

**Drop-off / corruption surface:** a single bad upload aborts onboarding; a slow compile shows fake progress then lands on *mock* confirm data; abandonment leaves orphaned `bio_sources` + a mutated `brands.url` with no `bios` row and no client trail to resume.

---

## 4. Certification / Steward gate

**States:** one boolean `bios.certified` + attribution. `cert_kind` is *why reviewed*, not a stage. The only real state machine is `steward_jobs.status ∈ {queued, in_review, pending_lead_review, completed, cancelled}` — governing the review *task*, not the BIO.

**The gate (critical):**
- Enforcement primitive = `requireCertified` in `loadBrandBio` → adds `.eq("certified", true)`, throws `BIO_NOT_CERTIFIED`. Strict wrapper `loadBioForRun` hardcodes it true — **and has zero callers**. Every live path passes `false` (`runs.js:73`, `brandolph.js:39`, `briefs.js:26`), by documented design (`runs.js:67-70`). The `try/catch` for `BIO_NOT_CERTIFIED` in `runs.js:75-77` is **unreachable**.
- **Craft ("send to human") gates on subscription tier only** (`craft.js:64`), never on certification — paid production polish can run on output from an uncertified BIO.

**Reviewer machinery (the most built-out, genuinely functional, part):** role-gated queue (`requireSteward` + RLS `steward_role`), round-robin assignment with Lead fallback (`assign-steward.js`), reviewer UI showing candidate BIO + all `bio_sources` evidence + a computed **focus list** (`bio-focus.js`, gaps-first then importance×(1−conf)), a genuine **two-human calibration** step (`pending_lead_review`). Recorded reasoning is **free-text only** (`steward_notes`, `override_reason`). Decision states are **thin**: Steward complete/cancel; Lead approve/send-back. **No "approve-with-conditions", no structured "reject/return with required changes", no pass/fail rubric with thresholds.**

**Revocation:** **no decertification path exists** (grep `decertif|revoke` = nothing). The only `certified→false` is un-doing an in-flight tentative cert during calibration. Because runs ignore `certified`, cert status changing has **zero effect** on in-flight or subsequent runs. Edits create a new uncertified version + enqueue `drift_check` but **do not block** — the edited version is immediately what runs read (the loader's "keep serving previously-certified" docblock at `bios.js:158-160` is false in practice).

**Separation of duties:** the rotation rule ("a Steward never certifies a brand they craft on") is **documented as a TODO, unbuilt** (`assign-steward.js:31-38`). The dev grant script hands one user both `steward`+`lead_steward` (`grant-steward.mjs:55`), and the design-partner plan has the founding team self-cert — so one human can submit and approve.

---

## 5. The 55 specialists — BIO consumption & invented-data risk

**Registry:** source of truth is a **browser mock, `src/portal-data.js`** (`CI_AGENTS`, `CI_DEPT_SPECS`, `CI_SPECIALIST_SPECS`), `vm`-`eval`'d server-side by `seed-specs.mjs` and projected into the `specs` table. Its own comments call this a stopgap. **55 agents** across 7 depts (Strategy 6 / Concept 8 / Copy 11 / Visual 11 / Web&UX 7 / Motion&Sound 5 / Research&Ops 7); Motion&Sound `status:"soon"` (deferred, correct). Nuances: 2 live agents are `internal:true` (BIO Compiler, Audit&Ledger); **5 "live" agents are never runnable** because their vendor (`v0`/`framer`/`exa`) has no adapter. Effective Brandolph pool ≈ 43. Stale "33" still in `portal-data.js:58` and `seed-specs.mjs:6`.

**Invented-data risk (the product's core thesis, ranked):**
- **C1 CRITICAL — whole-BIO substitution.** BIO-less brand → `load-brand-bio.js:61-73` returns the fully-populated fictional Vinilo Coffee BIO as ground truth. Every specialist run for such a brand is fed another brand's identity. Signalled only by a `console.warn`.
- **C2 HIGH — L2 agents told to match a voice, never told not to invent one.** The specialist `PLATFORM_PREAMBLE` says "use the brand's voice from the BIO" (`compose-specialist-prompt.js:42`) with **no anti-invention line**. The guardrail exists only on L1 Brandolph (`prompt.js:93`). None of the 55 inherit it.
- **C3 MEDIUM — silent field omission.** `renderBioSlice` emits a line only when the field is truthy; a thin BIO produces a prompt that *looks* complete with (e.g.) the entire VOICE block missing and nothing marking it absent-vs-unconstrained. Thin BIOs are the **designed steady state** (the compiler leaves fields empty on purpose), so this path is hit routinely.
- **C4 MEDIUM — Sharpener infers brief params** ("assume the default … infer platforms … best-guess platform array", `sharpener.js:58,84-85`). Task-parameter inference (lower severity), but noted.
- **Positives:** compiler is conservative and honest (C6); some explicit refusals exist (contradiction-based, not absence-based).

**Net:** no spec tells an agent to "make things up." The risk is structural — a live whole-BIO fallback (C1) + an L1-only guardrail (C2) on a composer that hides holes (C3).

**Runnable filtering:** `fluxSchnell` **is** present in `IMAGE_MODELS` (`portal-brandolph.jsx:783`) — the feared regression is not present.

**Routing cost shape:** spec-driven; Anthropic direct (opus×6, sonnet×15, haiku×4, cache-amortized) + OpenRouter Gemini (gemPro×5, gemFlash×6, no cache benefit) + fal images (gptimage×6, flux×2, fluxSchnell×4, recraft×1). Brandolph L1 routes to **sonnet** (not opus); BIO Compiler downgraded opus→gemPro. **`gptimage` is a fake alias mapping to `vendor/fal/flux-1.1-pro`** — no real GPT-image integration.

---

## 6. Design system, i18n, RTL, Arabic

**Design tokens:** `public/caastor/` — `ds-tokens.css` (v2 source of truth) → `portal.css` (components) → `caastor-tokens.css` (legacy bridge). Full token set: fonts, type scale+line-heights, radius, spacing (2→128px), motion (easings+durations), 5 palettes (default `caastor` = yellow `#F8C036` + purple `#8436C0`), surfaces (light+dark), text/border/status colors, shadows, density, product tokens (`--model-*`, `--layer-l1/l2/l3`). Solid, variable-driven.

**Shipped default:** `index.html:2` = `data-theme="light" data-font="inter"` → **Inter Tight**. This **contradicts every brand authority** (`caastor-marketing/visual-direction.md` + pitch `brief-diseno`): both mandate **dark-first (`#0A0A0A`/`#0E0D0C`) + IBM Plex Sans Condensed**. IBM Plex exists only as a non-default preset.

**Arabic coverage: ZERO.** No loaded family ships Arabic glyphs (IBM Plex *Sans Arabic* is a separate family, not imported). No `@font-face` for any Arabic/Noto face. Arabic → OS fallback / tofu; heading identity lost.

**RTL: absent everywhere.** Zero `dir=`, zero `[dir=]`, zero `direction:rtl`, zero logical properties. Layout is entirely physical (`padding-left:248px`, `.app-dock{left:16px}`, …). RTL is greenfield.

**i18n: absent.** No i18n library, no locale/translation files, `lang="en"` hardcoded, all copy inline English. EN-only — **no Spanish product locale either**, despite the brand's primary market being Spain.

**Tension to resolve (see §11):** `caastor-marketing/icp-markets.md` says the Gulf GTM ships **English** content with "Arabic design capability" as a *differentiator to mention* — not Arabic content. The goal mandates full EN/ES/Arabic content parity. These conflict.

---

## 7. Prior specs — the five named artifacts

The goal named five prior specs to check drift against. Reality:

| Named artifact | Exists? | Implemented? | Finding |
|---|---|---|---|
| **UX specification** | Distributed, no single doc | IA: yes; visual: partial | IA lives across `ia-plan.md` + `modes-templates-steward-plan.md` §2-3/§7 + canvas specs; **implemented** in `portal-shell.jsx`. The canonical `CaastorOS-Design-System.md` cited by the pitch brief is **absent from this repo**. |
| **Product brief** | Not as a discrete file | n/a | Role played by `CaastorOS-Investor-Brief.md` + `CLAUDE.md`; both **partially stale** on specialist roster/dept contents. |
| **Super Admin role** | ⚠ **No spec, no code** | No | Zero hits for "super admin" anywhere. Only role model is `users.role ∈ {client,team,admin}` + `team_members.roles[]`. Billing plan explicitly: "no separate owner — maps to `admin`." **The goal's reference is ungrounded — needs a decision (§11).** |
| **Brief Builder** | ⚠ **Phantom** | No | Appears only as a *specialist name* in the investor brief/CLAUDE.md; exists in no plan and no code. The real capability is **The Sharpener** (`a02`, `sharpener.js`). |
| **Annotation system** | ⚠ **No user-facing feature** | No | No canvas commenting/markup/pins anywhere. Nearest real construct is the **BIO confidence/source provenance map** (a PLAN, env-gated, partially shipped). Canvas cards support select/edit/export/re-run, not annotation. **Needs disambiguation (§11).** |

---

## 8. Consolidated contradiction / drift register

1. **"Certified BIO is the moat" vs. cert never enforced.** UI says "certified by {Steward}"; no run requires it. *(Intentional MVP decision, documented.)*
2. **`loadBioForRun` docblock** ("specialist code MUST go through this loader") vs. **zero callers**.
3. **`bios.js:158-160`** ("previously-certified version keeps serving") vs. loader serves highest version regardless of cert.
4. **Specialist count 33 (all engineering plans + `?ask=` allowlist) vs. 55 (code).**
5. **Investor-brief department contents** don't match code specialist names (illustrative-but-wrong).
6. **"Brief Builder" / "Super Admin"** named as things-that-exist; neither does.
7. **BIO payload shape** duplicated and drifting across 5+ definitions (`ownership`, `tertiary`, mandatory sections).
8. **`gptimage` labeled as real GPT-image**; actually aliases flux-1.1-pro.
9. **Shipped design default (light + Inter Tight)** vs. brand authority (dark + IBM Plex).
10. **Tier entitlements specced as hard gates**; only brand-count is server-enforced (billing deferred).
11. **Brandolph = Opus** (CLAUDE.md routing table) vs. actually **sonnet** (`router.js:81`).
12. **Marketing GTM (EN + ES native, Arabic as design capability)** vs. shipped **EN-only** and vs. **goal's EN/ES/Arabic content parity**.
13. **`visual{}` empty by default** (`DISCOVERY_V2` off) — undocumented in CLAUDE.md.
14. **Silent Vinilo whole-brand fallback** — undocumented in CLAUDE.md.

---

## 9. Security findings

- **⚠ RLS write gap (`bios`).** Policy `ws_bios` is `for all to authenticated using (brand_id in (select id from brands))` with **no `WITH CHECK`** (`init.sql:391-392`; the only `WITH CHECK` in the whole migration set is on `notification_prefs`). Postgres reuses `USING` for writes, so an authenticated browser (anon key + JWT, `supabase-browser.js`) can `UPDATE` its own brand's `bios` row and set `certified=true, certified_by=<any uuid>, cert_kind='onboarding'` **directly via the Supabase REST API**, bypassing the Steward entirely. Today it only forges the trust badge (runs ignore the flag); the moment `requireCertified` is turned on, **it becomes a full gate bypass**. Fix: add `WITH CHECK` clauses to `bios` (and audit other `for all` policies) so client writes cannot set certification fields. This must land *with* the gate, not after.
- **Separation-of-duties:** unbuilt rotation rule + dual-role dev accounts allow submit-and-approve by one human (§4).
- **Evidence upload = injection surface (Phase 3 threat-model item).** Uploaded docs are read by a compiler LLM; prompt injection through client assets is a first-class threat once `DISCOVERY_V2` is on.

---

## 10. Classification: keep / throwaway / must-migrate / must-build

**Keep (solid foundations):**
- Server discovery write path: `discovery.js` → `compile-bio.js` → `bios`/`bio_sources`/`steward_jobs` (idempotent, append-only, retried, workspace-authorized).
- Append-only versioning + `runs.bio_version` pinning (reproducibility substrate).
- Deterministic pure functions: `score-bio.js`, `bio-focus.js` (tested).
- Compiler's conservative "leave empty + `missing[]` + confidence" contract — the honest half; the *data model* for field provenance already lands, just ungrounded.
- Steward queue / assignment / reviewer UI / calibration / role-gate (middleware + RLS).
- Four-layer cache-aware prompt composer + per-dept `bioSlices` (tested).
- `BioViewer` (`#/bio`) — the genuine editable BIO surface.
- Design-token system (variable-driven, complete).

**Throwaway (demo scaffolding / misleading — excise or make real):**
- `DiscoveryStep2Results` mock render of `CI_DISCOVERY`; `DiscoveryStep3` hardcoded monologue; `url` default `"vinilo.coffee"`; inert buttons.
- Client hardcoded `BIO_IDENTITY/AUDIENCE/...` arrays (superseded).
- `server/src/data/vinilo.js` as a **silent runtime fallback** (keep it as a *test fixture/seed*, never as a live substitute).
- `loadBioForRun` dead code + unreachable `BIO_NOT_CERTIFIED` catches + docblocks asserting an enforced gate.
- Steward `score:75` hardcode.

**Must-migrate:**
- Registry source of truth off the `portal-data.js` browser mock into a real server/DB definition.
- BIO payload shape → a single normalized/validated schema (one source, not 5).
- Provenance `{conf, source-string}` → event-sourced, evidence-linked, per-assertion history.

**Must-build (does not exist):**
- The actual certification **gate** at the data layer + fail-closed behavior for no-BIO brands.
- The **two-stage** model (self-cert → engagement, human-cert → production).
- **Decertification / revocation** + defined in-flight-work behavior.
- Structured reviewer **decision states** (approve / approve-with-conditions / return-with-required-changes / reject) + a config-driven pass/fail **rubric**.
- Separation-of-duties **rotation** enforcement.
- **RLS `WITH CHECK`** on `bios`.
- Agent-facing **provenance propagation** (serializers carry confidence/absence markers) + L2 **anti-invention guardrail**.
- **i18n** (EN/ES/AR), **RTL**, and **Arabic-capable typography**.
- BIO **version diff**.

---

## 11. Open decisions for Phase 1 (need your call)

These genuinely change Phase 1 scope; I can't resolve them from the codebase.

- **A. Super Admin.** The goal names it as a prior spec, but nothing exists. Is it a real requirement to build in this engagement, does it fold into the existing `admin` role, or is it out of scope for BIO/Discovery/Certification?
- **B. Certification enforcement rollout.** Turning the gate on is required. But the team deliberately kept it a soft signal so a slow cert never blocks design partners. Do we enforce hard immediately, feature-flag/grandfather current brands until they certify, or enforce only the stage-2 (production) gate while self-cert unlocks engagement instantly?
- **C. Arabic scope for v1.** The goal mandates EN/ES/Arabic content parity + real RTL. The brand's own GTM authority says the Gulf ships English content with Arabic as a *design capability to showcase*. Which governs v1 — full Arabic content parity now, or RTL + Arabic-capable typography now with Arabic content authored per-brand rather than as a shipped UI locale?

Defaults I will otherwise apply and document (no decision needed unless you object): treat `vinilo.js` as a test fixture and make no-BIO brands **fail closed**; rewire Discovery's Confirm to the real compiled BIO; fix `renderBioLayer` null-safety and the RLS `WITH CHECK` gap as part of the gate work; keep dark + IBM Plex as the brand-correct default only if/when we touch theming (not a Phase-2 driveby).

# BIO + Brand Setup — Final, User-Worthy Launch Plan

> Date: 2026-08-03 · Branch: `feature/image-quality-overhaul`
> Scope: fix the Vinilo/café leak, split brief/crew gating, ship a simple-but-real
> certification, and give the BIO a learning loop. **No UI redesign** (per scope
> answer) — only the minimal wiring the features require.

## Decisions locked (from the user)

1. **Certification is two-tier.** Owner **self-cert** is *optional & instant* and
   unlocks the crew (`cert_kind='self'`). Senior-human cert is the **recommended**
   path and the moat (`cert_kind='steward'`), nudged in-product. A self-certified
   brand can **request human revision at any time** (upgrade path never closes).
2. **Certified output = versioned certified BIO + "certified by {name} · {date}"
   attribution** on every crew output. Nothing fancier.
3. **HARD GUARDRAIL — BIO data is NEVER downloadable/exportable.** Confirmed none
   exists today (`bios.js`, `discovery.js`, BioViewer are clean). Do not add one.
4. **The BIO must learn** from briefs + approved work and feed itself — but learned
   changes land as an **uncertified draft**, never entering the canon without a
   re-cert (keeps the moat intact).

## Standing guardrails (from CLAUDE.md — do not violate)

- Don't change flow/features beyond this plan without checking first.
- Credits only — never surface API $.
- Cost-optimized routing; cheapest model that clears the quality bar.
- The certified BIO is the moat; the canvas is the moat after it. Don't gut either.

---

## Phase 0 — Kill the Vinilo/café leak (ship first, independent bugfix)

The leak has exactly three sources. Fixing them is a small, self-contained diff and
should ship before anything else because it's a live correctness bug.

**0.1 `server/src/lib/load-brand-bio.js` — remove the Vinilo fallback (primary).**
- Delete the `VINILO_*` import and the whole `if (!bioRow)` Vinilo-return branch.
- Always fetch the latest BIO **without** the `certified` filter, then branch in JS
  so error messages are precise:
  - no row at all → throw `BIO_NOT_READY` (run Discovery first)
  - `requireCertified && !row.certified` → throw `BIO_NOT_CERTIFIED` (certify to run crew)
  - else return it.
- Refusals: `brandRow.refusals?.length ? brandRow.refusals : []` — **drop
  `VINILO_REFUSALS`** in BOTH branches (this is the leak that survives Discovery).
- Keep `loadBioForRun` = strict (`requireCertified:true`). Export the lenient
  `loadBrandBio` for Phase 1.
- **Check:** `load-brand-bio.test.mjs` — assert a brand with no BIO throws
  `BIO_NOT_READY` (not café content), and empty refusals return `[]`.

**0.2 `server/src/lib/sharpener.js` — scrub few-shot literals (L74, 101, 108).**
- Replace the "Vinilo / Tuesday ritual", "Café, candlelit", "over coffee" examples
  with **sector-neutral placeholders** (e.g. `"{Brand} needs {ritual} to feel
  earned…"` phrased generically, or a non-food example). The instruction stays; only
  the brand-specific illustration changes.

**0.3 `server/src/lib/extract-visual-vision.js` — scrub imagery example (L34).**
- Replace `"low-light café interiors"` with a neutral one (`"tight product
  close-ups"`, `"no models"` — already brand-agnostic).

**0.4 Keep `server/src/data/vinilo.js` as a dev seed only.** It's fine as fixture
data for `scripts/` and tests; just ensure **no runtime path imports it** (after 0.1,
grep `rg VINILO server/src/{lib,routes,inngest}` returns nothing).

**Verify Phase 0:** create a fresh non-café brand → run Discovery → sharpen a brief →
zero occurrences of "vinilo/café/coffee/Tuesday" in output. `npm run test:units`.

**0.5 Stale-BIO caveat (data, not code).** Phase 0 fixes the leak *at the source*.
Any brand whose BIO was **compiled earlier, while the leaky prompts were live**, may
have café/Vinilo text **baked into its stored `bios.payload`** — those persisted rows
won't change until that brand re-runs Discovery. Remedy: **re-run Discovery** on
affected brands to overwrite with a clean BIO version (the old version stays until the
new one is certified, so nothing breaks mid-flight). Optional helper: a one-off script
that flags BIOs whose payload matches café/Vinilo markers so the user knows which to
refresh. Not required to ship 0–4; surface it as a "refresh recommended" nudge.

---

## Phase 1 — Split the gating (briefs pre-cert · crew post-cert)

Today `briefs.js`, `brandolph.js`, and `runs.js` **all** use `loadBioForRun`
(requires `certified=true`), so everything is locked until a Steward signs. Repoint:

| Surface | File | Loader after | Requires |
|---|---|---|---|
| Sharpen brief | `server/src/routes/briefs.js` | `loadBrandBio` (lenient) | BIO exists (uncertified OK) |
| Ask Brandolph | `server/src/routes/brandolph.js` | `loadBrandBio` (lenient) | BIO exists (uncertified OK) |
| Run crew | `server/src/routes/runs.js` | `loadBioForRun` (strict) | **certified** |

- Both surfaces must catch `BIO_NOT_READY` → 409 "Run Discovery to build the BIO first."
- `runs.js` keeps catching `BIO_NOT_CERTIFIED` → 409 "Certify the BIO to run the crew."
- **Check:** a route-level test (or manual) — uncertified brand: `/api/briefs/sharpen`
  200, `/api/runs/stream` 409 `BIO_NOT_CERTIFIED`.

---

## Phase 2 — Simple-but-real certification (self + recommended senior)

**2.1 New endpoint — owner self-cert.** `POST /api/bios/:brandId/certify`
(`requireAuth`, workspace owner). Flips the latest BIO version:
`certified=true, cert_kind='self', certified_by={user id/name}, certified_at=now()`.
Returns `{ certifiedVersion, cert_kind:'self' }`. This alone unlocks the crew.
- Guard: requires a compiled BIO (has a `score`); don't hard-block on low score —
  nudge instead (self-cert is meant to be instant).

**2.2 Recommended senior path stays as-is.** `POST /api/bios/:brandId/request-review`
already enqueues a Steward job; the Steward/Lead flow in `routes/steward.js` +
`portal-team.jsx` is unchanged and sets `cert_kind='steward'`. Allow calling
`request-review` **even after self-cert** (upgrade anytime) — confirm it doesn't 409
on an already-certified brand.

**2.3 Minimal client wiring (BioViewer, `src/portal-discovery.jsx`).** Not a redesign:
- Primary button **"Certify BIO"** → `POST …/certify` → on success, crew unlocks.
- Secondary, visually recommended: **"Get a senior human to certify ✓ (recommended)"**
  → `request-review`. Copy nudges toward it as the trust/moat layer.
- Show cert state: `uncertified` / `self-certified` / `senior-certified ✓`.
- `portal-brandolph.jsx` already renders "Locked until certification" — extend it to
  reflect the two-tier state and to **allow the brief surface pre-cert** (crew CTA
  stays locked until certified).
- **Check:** self-cert flips state and unlocks the crew CTA without reload
  (reuse the existing `brand:changed` refetch pattern).

---

## Phase 3 — Certified output = version + attribution (mostly already wired)

- `runs.js` already stamps `certifiedBy: brandBio.bio.certified_by` on completion
  (L550). Extend the output footer to also show `cert_kind` so a senior-certified
  output reads "certified by {name} · senior review ✓" vs self "certified by you".
- **Guardrail re-assert:** no endpoint returns the BIO as a file/download. Add a one-
  line comment in `bios.js` GET handler: `// BIO payload is view-only — never a
  download/export (moat). Do not add attachment/content-disposition here.`

---

## Phase 4 — BIO learning loop ("Brandolph feeds the BIO")

**Goal:** approved briefs/work strengthen the BIO — safely. Reuses existing
primitives; the only new piece is a "propose patch from work" step.

**How it works:**
1. **Signals (exist):** `recordSignal()` already logs approve/flag/edit per output.
   Ensure the brief/output surfaces call it on approve + on user edits (edits are the
   richest signal — a changed word reveals a forbidden term; a kept headline reveals
   voice).
2. **Trigger (cost-safe):** two ways, no always-on cost —
   - **Manual:** a "Refresh BIO from recent work" button in BioViewer.
   - **Auto-draft:** after *N* approved/edited outputs for a brand (threshold in
     `plan-limits.js`-style const), enqueue one Inngest job.
3. **Propose (one cheap call — Gemini Flash/Haiku):** input =
   `loadBrandMemorySummary(brandId)` + recent approved/edited output text +
   `computeFocus(payload)` (fills **gaps first**, then low-confidence fields) + current
   BIO. Output = patch: `{ "dotted.path": { value, conf, source:"learned from work · <evidence>" } }`.
4. **Land as an uncertified draft:** write a **new BIO version** via the existing
   `bios.js PATCH` path (`certified=false`). Surface in BioViewer: *"Brandolph learned
   N things from your work — review & re-certify."*
5. **Re-cert to enter canon:** owner self-certs (or requests senior) → the learned
   version becomes live. **Nothing learned runs the crew until re-certified.**

**Safety rules (the check):**
- A learned patch **never** sets `certified=true`.
- **Never overwrites** a field whose current confidence ≥ threshold (e.g. 80) unless
  it's a `missing`/gap field — learning *fills and strengthens*, doesn't silently
  rewrite the canon.
- Stays in DB — no export (guardrail 3).
- **Check:** unit test on the patch-merge fn — asserts (a) no `certified` flip,
  (b) high-confidence certified fields survive, (c) gaps get filled.

**Open sub-decision (default chosen):** trigger cadence. Defaulting to **manual button
+ auto-draft at a threshold** (no nightly cron → no idle cost). Say the word to change.

---

## Sequencing & effort

| Phase | Ships | Rough size | Risk |
|---|---|---|---|
| 0 · Leak fix | independently, first | ~1 file heavy + 2 tiny | low |
| 1 · Gating split | after 0 | ~3 one-line repoints + errors | low |
| 2 · Self-cert | after 1 | 1 endpoint + BioViewer wiring | med (UI) |
| 3 · Attribution + guard | with 2 | tiny | low |
| 4 · Learning loop | last | 1 Inngest fn + 1 cheap-model prompt + merge fn + test | med |

Phases 0–1 make "add a brand → write briefs" clean and leak-free. 2–3 make the crew
real and gated. 4 makes the BIO compound over time. Ship 0 immediately; 1–3 as the
launch bundle; 4 as the follow-on that turns it into a moat that grows.

---

## STATUS — shipped 2026-08-03 (Phases 0–4, uncommitted, branch `feature/image-quality-overhaul`)

**Done + verified** (132 unit tests pass; all server `node --check` clean; all client JSX parse-checks clean; Phase-4 import chain resolves):
- **Phase 0** — Vinilo fallback + `VINILO_REFUSALS` removed from `load-brand-bio.js`; café/Vinilo few-shots scrubbed from `sharpener.js` + `extract-visual-vision.js`; pure gate helpers + test.
- **Phase 1** — `briefs.js` + `brandolph.js` use the lenient loader (`BIO_NOT_READY` 409); `runs.js` stays strict. **Client**: `portal-brandolph.jsx` stage-gate now lets the composer open pre-cert (`stage: "uncertified"`) and gates the crew run in `handleRun` on `bio.certified`.
- **Phase 2** — `POST /api/bios/:brandId/certify` (self, instant) + `POST /:brandId/learn` trigger + view-only guard comment. Senior path (`request-review`) unchanged, reachable anytime. BioViewer wired (certify / recommended-senior / cert badge / refresh-from-work / re-certify nudge / softened copy).
- **Phase 3** — `certKind` stamped on outputs; both output footers render self vs senior (self-cert shows "self-certified", no name).
- **Phase 4** — `bio-learn-merge.js` (pure, tested: fills gaps, strengthens low-conf, never overwrites conf≥80, never certifies) + `learn-bio.js` Inngest fn (one cheap Gemini-Flash call → uncertified draft + notify) + registered.

**Key design decision — no migration.** The DB `bios.cert_kind` CHECK only allows Steward job kinds and `certified_by` is a `team_members` FK, so `'self'` can't be stored there. Self-vs-senior is **derived**: `certified && certified_by → 'steward'`; `certified && !certified_by → 'self'`. Self-cert writes `certified=true, certified_by=null`. The client-facing `cert_kind` is computed in `load-brand-bio.js` (for runs) and `GET /:brandId` (for the viewer). This also fixed a latent bug where a raw UUID was passed as the certifier name.

**Known follow-ups (not blocking):**
1. **SPA mock/demo data still says "Vinilo/café"** — `portal-data.js`, `portal-craft.jsx` (default brand name), `portal-team.jsx`, `portal-floater.jsx`, `portal-briefs.jsx` ("Most used for Vinilo", `exportName="vinilo-canvas"`). This is demo scaffolding, NOT the generation pipeline (a new brand's results are clean), but it shows "Vinilo" in app chrome. Separate scrub/live-wire task.
2. **Two secondary cert footers** (`portal-briefs.jsx` ~2739/4104) read a separate brand-level `cert` object (resolves name from `certified_by` UUID) → show a blank name for self-cert. Cosmetic; re-source to `cert_kind` when convenient.
3. **Auto-learning trigger** deferred — manual "Refresh BIO from work" button ships now; the N-approved-outputs auto-draft is a `// ponytail:` note in `learn-bio.js`.
4. **Stale BIOs** (§0.5) — brands compiled under the old leaky prompts should re-run Discovery.

## What's explicitly OUT of scope (per answers)

- BIO export/download of any kind (hard no).
- Broad visual redesign of the setup flow (only feature-required wiring).
- Changing the Steward/Lead senior flow beyond making it optional + reachable anytime.

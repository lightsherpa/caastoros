# CaastorOS — Modes, Templates, Brand Steward · Implementation plan

_Date: 2026-05-24 (rev 2) · Status: PLAN, ready for engineering refinement before API integration (P0). Rev 2 closes contradictions, adds tripwires + safety valves, locks edge cases (churn, capacity, allowlist), and adds §17 moat reinforcement summary._
_Scope: net-new product surfaces (Auto/Manual/Template modes + Brand Steward layer) + ports from a Pletor benchmark + naming + canvas/workspace behavior._
_Companion docs (read first): `ia-plan.md`, `specialists-plan.md`, `apis-and-agents-plan.md`. This doc is additive — nothing in those is superseded._

---

## 0. What this doc is

A single, self-contained spec the lead engineer can pick up, refine, and slot into the existing P0→P8 sequence in `apis-and-agents-plan.md`. It consolidates four threads:

1. A benchmark against **Pletor** (a node-graph "Use AI" studio for marketers — `docs.pletor.ai`) — what we keep, what we port, what we deliberately reject.
2. A new three-mode model for the brief→ship loop: **Auto · Manual · Template**.
3. A new **Brand Steward** layer (human certification of the BIO at onboarding + recurring).
4. **Tier inclusion** so the above is bound to the monetisation ladder, not floating.

Nothing here changes the runtime kernel (`§2 Specialist Runtime` in `apis-and-agents-plan.md`). Modes, templates, and the Steward all sit **above** the runtime as orchestration + UX layers.

---

## 1. The thesis (one paragraph)

Pletor's USP is *expose the nodes — let the user compose*. Ours is the opposite: *hide the nodes — Brandolph composes, a senior team certifies*. The benchmark confirmed that our role-shaped specialists, our versioned BIO, and our QA gates are real structural advantages over node-graph tools. But Pletor exposed three real gaps in our product: we have no power-user surface (the Canvas is a Phase-3 placeholder), our docs are not AI-queryable (we'll lose the AI-SEO race by default), and we don't surface model routing as a trust signal. This plan closes those gaps **without** dilluting "shape, not produce." It does so by introducing three explicit modes — Auto (the default, what we have today), Manual (the playground, a power surface inside an open brief), and Template (5 named plays for known objectives) — and by introducing the Brand Steward role to certify the BIO at the moment of greatest extraction risk: onboarding.

---

## 2. IA — 4 sections, 2 children each — LOCKED 2026-05-24

The client portal nav is **four sections, two items per section**. Section eyebrows ARE the contents (slash-joined), not abstract category names. Replaces the 4-section structure proposed in earlier `ia-plan.md` (Workspace / Brand / Intelligence / Account).

```
CREATE / BRIEFS                ← section eyebrow
  Create          → home       (the brief→ship loop — Brandolph composer)
  Briefs          → briefs     (library of past briefs + outputs)

BIO / LIBRARY                  ← section eyebrow
  BIO             → bio        (the certified brand canon — viewer + editor)
  Library         → library    (source library — Foundations / Visual / Voice buckets per §5.3)

SPECIALISTS / HUMANS           ← section eyebrow
  Specialists     → specialists (the 33 AI — L2)
  Humans          → humans      (the team — L3; Stewards live here as a sub-group)

CREDITS / ACCOUNT              ← section eyebrow
  Credits         → credits     (ledger + top-up)
  Account         → settings    (settings, billing, workspace, additional-workspace purchase)
```

### 2.1 Where things deliberately do NOT have a nav home

- **Canvas** — workspace state, not a destination. Triggered inside Brief Detail or Manual mode (§3.3, §7). Floating nav with hover-reveal labels.
- **Discovery** — demoted from nav as planned in `ia-plan.md`. Reachable from inside the BIO ("Re-extract" / "Run discovery") or onboarding flow. **Cost + behavior (locked):** Re-extract costs 30 cr (Tier 01+; rejected on Free). Runs a30 BIO Compiler against current website + any new sources, drafts a candidate `bios` row with `certified = false`, and queues a Steward drift-style review (counts against the quarterly cap on Tier 02; included on Tier 03). The currently certified BIO version remains active for all specialists until the new candidate is certified.

### 2.2 Naming locks

- **L1 = Brandolph** (existing — unchanged).
- **L2 = Specialists** (existing — unchanged).
- **L3 = Humans** (NEW — replaces `Human craft` / `craft` in code). Direct label. Pairs against "Specialists" — one section, two truths: AI specialists and humans. Stewards (§5) are a sub-group inside Humans.

### 2.3 Implementation note (engineer)

- Rename `/craft` route's nav label to **"Humans"**. Route id stays `craft` for now (changing the id touches `TopBar.titles`, route guard, `ScreenRouter`); rename can come in a follow-up cleanup. Decision: **defer route-id rename to M4 cleanup** per `specialists-plan.md` pattern.
- Add a new route `/library` for the source library (currently doesn't exist). Route id: `library`. Sits under section 2.
- Update `CLIENT_ROUTES` in `portal-shell.jsx`:
  ```js
  const CLIENT_ROUTES = [
    { id:"home",        label:"Create",      section:"Create / Briefs" },
    { id:"briefs",      label:"Briefs",      section:"Create / Briefs" },
    { id:"bio",         label:"BIO",         section:"BIO / Library" },
    { id:"library",     label:"Library",     section:"BIO / Library" },
    { id:"specialists", label:"Specialists", section:"Specialists / Humans" },
    { id:"craft",       label:"Humans",      section:"Specialists / Humans" },  // ← label change, route id stays
    { id:"credits",     label:"Credits",     section:"Credits / Account" },
    { id:"settings",    label:"Account",     section:"Credits / Account" },
  ];
  ```
- Sidebar renders each section eyebrow once at the boundary. Floating mode (workspace state) collapses to icons with hover-reveal labels per §7.

### 2.4 Honesty note — why "Specialists / Humans" pairs two intents

The 'Specialists / Humans' section pairs AI specialists and the human team in one section eyebrow as a deliberate marketing frame — the section header itself tells the "AI + humans" story before the user clicks anything. We accept that this isn't a clean user-task partition (the two children serve different intents: *"what AI did the work"* vs. *"who certified my brand"*) in exchange for the structural narrative being legible in the nav. If user research later shows the pairing confuses scanning, the fallback is to keep two children but rename the section eyebrow to a job (e.g. *"Who made this"*) — not to split into two sections.

---

## 3. The three modes (Auto · Manual · Template)

The brief→ship loop today supports one path: Auto. We're adding two affordances around it. **Critical IA discipline: this is not three equal doors.** A new user must not land on a "pick a mode" screen — that re-creates the tool-gallery problem `ia-plan.md` already diagnosed.

### 3.1 Where each mode lives in the IA

```
HOME (Create) — sticky big composer
├─ Big input: "What do you want to make?"          ← AUTO (the default)
│  ↓ Brando reads BIO → sharpens → proposes assembly → user approves → run
│  └─ inline link in the proposed assembly: "Adjust assembly →"   ← enters MANUAL on the same brief
└─ Subtle row below composer: "Start from a template"             ← TEMPLATE
   → 5 named cards, not a catalogue
```

Net rule:
- **Auto** is the page.
- **Manual** is a verb you do *to* an Auto-generated brief. **You cannot cold-start Manual.**
- **Template** is a different entry point that routes into the same brief→ship loop.

### 3.2 Auto mode (the default · what we have today)

State machine already implemented in `HomeCreate` (`portal-brandolph.jsx`, per `IMPLEMENTATION_LOG.md 2026-05-22`):

```
idle → sharpening → proposing → running → done
```

No spec changes here. Auto stays the headline experience for every tier. **80% of subscribers should live in Auto forever — that is a feature, not a limitation.**

### 3.3 Manual mode (the playground · the power surface)

**Entry rule (locked):** Manual entry requires Brando to have proposed an assembly first. Click **"Adjust assembly →"** from inside the proposed-assembly review state. Brando's read (which now includes the Steward-certified BIO, §5) is always the starting context. **No blank-canvas cold start.** This preserves the senior-operator frame while giving power users somewhere to go.

**Veteran exception (DEFERRED to V2):** After a user has run ≥10 briefs on a single brand, an opt-in setting (`brand_settings.manual_cold_start_enabled`) surfaces a secondary **"Start in Manual →"** action on the composer for that brand only. The Auto-first principle remains the default forever; the exception exists for power operators who already know their assembly. Not in V1 — ship the rule first, add the exception only if veteran-abandonment data justifies it.

**What Manual unlocks:**
- Add / remove / reorder specialists from the proposed assembly.
- Swap one specialist for another in the same department (e.g., Conversion Copy → Long-form Editor).
- Add a second pass (e.g., run Voice QA twice; chain Tension-Finder → Refuser).
- Override `modelRouting.primary` per run — **role-gated at render time (locked).** Single Canvas component, no UI bifurcation. The model picker only renders when `team_members.roles ∩ ['ops','lead_steward'] ≠ ∅`; clients never see the control. The server endpoint re-validates the same role check before accepting any `modelRouting` override. One UI, two access tiers, single server-side enforcement point.

**What Manual does NOT unlock:**
- Free-form prompt editing on a specialist. Specs are immutable per run; spec versioning still lives in `specs` (per `apis-and-agents-plan.md §4.3`).
- Skipping the BIO injection.
- Skipping QA gates. **The QA gates (a18 Voice QA, a24 Brand Consistency QA) fire unconditionally regardless of mode.** UI must state this: small line under the assembly editor — *"Voice QA and Brand QA always run."*

**The UI = the Canvas.** This is where the Canvas finally has a real client-side job. Manual mode IS the Canvas. The proposed assembly renders as a node graph; the user edits the graph. Right rail = the Specialists directory in compact form, drag-in interaction. Wires show data flow (BIO slices → specialist → output). Retires the "Phase-3 placeholder" label permanently.

**Credit honesty:** show a live cost meter in the Canvas chrome as the user adds/removes specialists — `Estimated: 38 cr` updating in real time. Manual runs often cost more than Auto because users over-assemble. Surface it; do not hide it.

### 3.4 Template mode (the named plays · the marketing surface)

**5 surfaced per user (locked).** No category catalogue — each template is named, opinionated, and bound to an outcome. The cap is on what the user *sees*, not on what *exists* in the library; the library itself is versioned and editable per §4. See §4 for the V1 core.

A template is **not** "a stack of specialists." It is a fully-shaped object:

```ts
Template = {
  id, slug, name, tagline,
  outcome,                       // "Ship a launch in a day"
  briefSkeleton,                 // pre-populated brief fields (type, target, hypothesis seeds)
  assembly: SpecialistId[],      // the ordered specialist run
  expectedOutputKinds: string[], // e.g. ["hero_kv", "landing", "email_seq"]
  qaGates: { voice: true, brand: true },
  estimateCredits: number,       // pre-computed; refined per brand BIO
  tierFrom: "01"|"02"|"03",
  status: "live"|"draft"
}
```

**Behavior:** picking a template (a) creates a brief with `briefSkeleton` pre-filled, (b) routes through Brandolph for **brand contextualisation** (Brando still reads BIO and adjusts the assembly if the brand needs it — templates are starting points, not finished products), then (c) lands the user on the Auto review state. From there they can run or enter Manual.

**Why this matters for marketing:** each template gets a public landing page — `caastor.com/templates/the-launch` — and a queryable doc `docs.caastor.com/templates/the-launch.md?ask=...` (§8). Five named plays > thirty anonymous flows. Each one becomes an AI-SEO target and a sales conversation.

---

## 4. Templates — 5 surfaced per user, library editable — LOCKED 2026-05-24

**Framing locked.** Templates and industries are **content** La Mesa iterates on — not configuration shipped once. Both are data-driven, versioned, soft-deletable, and editable via admin tooling. The "5 hard cap" from earlier drafts is rejected — the cap is **5 surfaced per user**, not 5 ever existing.

### 4.1 Surface logic

Always exactly 5 templates visible on the Create surface. Ranked priority:

```
1. Industry match — template.industries ∩ brand.industry
2. Featured flag — manual override for seasonal / launch pushes
3. Recency / popularity — last_used_at DESC (tiebreak)
```

Plus a permanent **"View all templates →"** link from the Create surface that routes to the full library at `/templates`. All live templates remain publicly indexable for AI-SEO regardless of whether they're currently surfaced for any given user.

### 4.2 The V1 core (the 5 broad)

Locked. These ship across P4–P6 per §12 sequencing.

| # | Name | Outcome | Assembly (ordered) | Output kinds | Est. cr | Tier | Industries (tags) |
|---|---|---|---|---|---|---|---|
| 1 | **The Launch** | Ship a product launch in a day | a02 Sharpener → a03 Strategist → a20 Hero KV → a25 Page Composer → a13 Email Sequence → a14 Subject Lines → a18 + a24 QA | hero_kv, landing, email_seq | ~82 | 01 | all |
| 2 | **The Awareness Sprint** | A week of feed, on-brand | a04 Tension-Finder → a06 Territory Mapper → a21 Editorial Image ×3 → a16 Social Captions ×3 → a18 + a24 QA | editorial_image×3, social_caption×3 | ~62 | 01 | all, tilt: ecommerce_dtc / hospitality_fnb / consumer_brand |
| 3 | **The Pricing Move** | A pricing-page relaunch | a01 Diagnostician → a05 Refuser → a12 Conversion Copy → a25 Page Composer → a18 QA | landing, conversion_copy | ~48 | 02 | saas_software / ecommerce_dtc / professional_services |
| 4 | **The Identity Set** | Pre-design exploration before L3 craft | a30 BIO Compiler refresh → a06 Territory Mapper → a07 Namer → a19 Identity Drafts → a24 QA | identity_drafts, naming_set | ~58 | 02 | creative_agency / consumer_brand / new entrants |
| 5 | **The Lifecycle** | An onboarding/lifecycle drip | a03 Strategist → a13 Email Sequence → a14 Subject Lines → a17 Microcopy → a18 QA | email_seq, subject_lines, microcopy | ~38 | 01 | saas_software / ecommerce_dtc / hospitality_fnb |

### 4.3 Industry-specific additions (added post-launch based on real client signal)

**Do not pre-build these.** Add as the first 10 paying clients generate signal on what they actually ask for. Suggested early candidates (not locked):

- The Menu Drop (hospitality_fnb)
- The Feature Launch (saas_software) — distinct from a full product Launch
- The Portfolio Refresh (creative_agency)
- The Sale Push (ecommerce_dtc)
- The Capabilities One-Pager (professional_services)

### 4.4 Industry taxonomy — seed list (editable, not enum)

Stored in `industries` table, not hard-coded. Seed values for V1:

```
ecommerce_dtc          E-commerce / DTC
saas_software          SaaS / Software
hospitality_fnb        Hospitality / F&B
creative_agency        Creative / Agency
professional_services  B2B Professional Services
consumer_brand         Consumer Brand
education              Education
health_wellness        Health & Wellness
```

Editable from `/admin/industries` (V1) or the team portal admin route (V2). Multilingual labels (EN/ES/IT) supported in schema. Soft-delete supported — brands tagged to archived industries fall back to "broad" surfacing.

### 4.5 Industry attribution per brand

Inferred by a30 BIO Compiler during Discovery (free byproduct of reading the website + sources). User confirms or changes at end of Discovery flow — *"We've placed Vinilo in **Hospitality & F&B** — change?"*. Stored on `brands.industry` with `industry_confidence` (0..1) and `industry_source` (`inferred` | `user_confirmed` | `user_set`).

### 4.6 Versioning + reproducibility

Templates are versioned exactly like BIO and specs:

- Editing a template's assembly creates a new `template_versions` row; `active = true` flips to the new version; old version is preserved.
- Briefs created from `template_version 3` stay pinned to v3 forever via `briefs.template_version_id`.
- Reproducibility is maintained: a brief created in week 5 from "The Launch v3" can be re-run in week 50 against the same v3 assembly.

### 4.7 Auto-pruning

A template version that hasn't been used in **90 days** auto-flips to `status: draft` and is removed from the surface and the full library page. Admin can revive. **The library prunes itself.**

### 4.8 Estimates

`estimate_credits` is a seed value; recomputed weekly from real `runs` cost data per `apis-and-agents-plan.md §7`.

---

## 5. Brand Steward — the BIO certification layer

This is the single most strategically important addition in this plan. The BIO is the load-bearing object in the system — every specialist reads from it. AI extraction at onboarding is the weakest link. Adding a senior human as the certifier of the canon (a) closes the extraction risk, (b) provably operationalises "AI specialists + human team" on day one, (c) becomes the cleanest moat against Pletor / Gamma / Lovable / pure-AI tools, and (d) is the cheapest possible upsell hook into paid tiers.

### 5.1 The role — LOCKED 2026-05-24

**Brand Steward** is not a new hire — it's a **capability** held by senior L3 designers, performed in rotation. The same La Mesa designers who craft outputs for clients certify other clients' BIOs. This keeps brand fluency high (they speak the voice from production work), creates a natural career path (junior → senior craft → Steward-qualified), and avoids parallel hiring.

UI moment for the client unchanged: *"Your Brand Steward, Marina, will certify your BIO within 24h."* Named, faced, with a real designer's identity.

Stewards are L3 (Humans). They live as a **sub-group within the Humans section** of the nav (per §2), not as a separate L-level. A team_member can hold multiple roles simultaneously (`craft`, `steward`, `ops`).

**Rotation rule (hard-enforce):**

> A Steward never certifies a brand they actively craft on.

Implementation: when `steward_jobs.bio_id` is queued, the assignment query excludes team members who appear on any active `runs` row for that brand's outputs. Forces fresh eyes; prevents the same designer rationalising their creative choices into the BIO.

**Bench math at launch:**
- 2–3 senior designers cross-trained for Stewardship (≥3 required for clean rotation; 2 is the floor and forces predictable assignment).
- ~15–20% of their allocated La Mesa time goes to Stewardship; the rest stays on craft.
- One part-time Steward can theoretically certify ~120 BIOs/week (20 min × 8 hrs × 5 days). At launch, 1–5 certs/week — capacity is not the constraint, **calibration is**.

**Calibration:**
- For the first 30 days post-launch, every Steward certification is reviewed by a Lead Steward before delivery.
- Once the bench is calibrated, Lead Steward reviews shift to quarterly spot-checks.

**Capacity fallback (locked):** If no eligible Steward is available within the 24h SLA window (PTO, parallel cert load, or the rotation rule exhausting the bench), the Lead Steward becomes the override certifier — bypassing the rotation rule for that single cert. Logged in `steward_jobs.override_reason`. If the Lead Steward is also unavailable, the SLA auto-extends to 48h and the client receives an in-app notification: *"Your Brand Steward is finishing another certification — Marina will review yours by {date+48h}."* **No silent slippage.** A bench of 3 stewards + 1 Lead provides four-deep cover even with the rotation exclusion.

### 5.2 The SLA + pricing — LOCKED 2026-05-24

**V1: one scope — Verify + Refine.** 30-minute SLA, ships in 24h. **Skip Enrich** in V1 (the "pull missing things from the client's references" scope) because it's where time blows up and we can't reliably price it. Add Enrich in V2 once we have data on average review time.

**Pricing model — bundled at onboarding, metered on recurring.** Loss-leader logic intentional and bound to the tier ladder. Eats Steward cost at the trust moment (onboarding), creates a small visible cost on the retention layer (drift check), and differentiates Tier 02 from Tier 03.

| Surface | Tier 00 Free | Tier 01 Studio | Tier 02 Brandolph | Tier 03 Suite |
|---|---|---|---|---|
| Onboarding certification | — | Add-on: 50 cr | **Included (0 cr to user)** | **Included (0 cr to user)** |
| Quarterly drift check | — | — | **15 cr per check** (cap 4/year) | **Included, unlimited** |

**Cost basis (assumptions to confirm in §13):**
- Steward time per certification: ~20 min @ €40/hr = **€13.33 absorbed per onboarding** on Tier 02+. One-time per subscriber.
- 1 cr = €0.20 (existing).
- At 100 Tier 02 subscribers: €1,333 absorbed at onboarding (trivial vs. subscription revenue).
- Drift checks at 15 cr (€3) remain loss-leaders against actual Steward time — accepted as a **retention-layer cost** bound to subscription revenue, not standalone profit.

**Why we removed the visible 50 cr at onboarding for Tier 02+:** anchoring the certification at €10 in the user's head positions it as a cheap consumable. La Mesa would normally charge €500–2000 for an equivalent brand audit. Bundling it inside the subscription preserves the premium frame ("a senior human certifies your brand — included in Brandolph") without changing the cost basis. Value capture is in the subscription, not the line item.

**Cost tripwire (locked):** If absorbed Steward cost per onboarding cert sustains >**€25** (~30 min median review, accounting for the calibration overhead in §5.1) over any rolling 30-day window, flip Tier 02 onboarding cert from "included (0 cr)" to a one-time visible **50 cr line item** (matching the Tier 01 add-on price). Tier 03 inclusion is unchanged. Re-evaluate after the next 30-day window. The principle — *a senior human certifies your brand* — is preserved; only the absorbed-cost framing changes. **The tripwire protects unit economics without dropping the moat-defining feature.**

### 5.3 Source intake — three named buckets

Today BIO sources are a mush pile (`bio_sources` is a single table per `apis-and-agents-plan.md §5`). For Steward review to be efficient (20 min, not 60), the Discovery upload UX needs three labelled drop zones:

| Bucket | What goes there | Read by |
|---|---|---|
| **Brand foundations** | Brand book, decks, manifestos, "about us" docs | All specialists |
| **Visual references** | Moodboards, examples of work the client admires | Design dept (a19–a24) |
| **Voice references** | Emails, posts, talks where the client sounds like themselves | Copy dept (a12–a18) |

Schema delta: add `bucket: "foundations"|"visual"|"voice"` to `bio_sources`. The Steward UI groups sources by bucket; the prompt assembler (`composeSpecialistPrompt`) reads the right bucket per department (already designed in `bioSlices`).

### 5.4 Recurring quarterly certification (the retention layer)

Don't stop at onboarding. Every 90 days, the system schedules a **BIO Drift Check**:

1. Steward gets a job-queue card: *"Vinilo's BIO drift check · 12 outputs since last certification · est. 15 min"*.
2. Steward reads the last 90 days of outputs against the certified BIO.
3. Steward either re-certifies (no change), proposes an edit (creates a new `bios` version), or flags drift for client conversation.
4. UI surfaces a chip in the client's BIO viewer: *"Re-certified by Marina · 24 Aug"* — credit cost **scales with output volume reviewed** (Tier 02 only; Tier 03 unlimited at all volumes).

**Drift-check pricing — volume-scaled (locked):**

| Outputs since last cert | Tier 02 cost | Counts against cap | Steward method |
|---|---|---|---|
| ≤25 | 15 cr | yes (4/yr cap) | full read |
| 26–75 | 25 cr | yes (4/yr cap) | sampled: every output_kind + last fortnight in full |
| 76+ | 40 cr | yes (4/yr cap) | sampled: 5 per output_kind, last 30 days in full |

The in-app button surfaces the price honestly before the user opts in: *"Vinilo · 32 outputs since 14 Feb · 25 cr quarterly drift check"*. No surprise charges. The Steward sees the sampling rule on their job-queue card so review time stays predictable.

This is your stickiness layer. Subscribers do not churn from a service where a senior person quarterly says *"I noticed your voice has shifted warmer — should we update the BIO?"*

### 5.5 Output attribution — two render modes (locked)

Every output card today references `BIO vN`. The footer now also carries the Steward chip — but the render splits by audience.

**Client footer (default, public, on-card):**
```
Composed by Conversion Copy · BIO v7 · certified by Marina · 14 May
```

**Team-side debug view (hover-reveal in client UI, default-visible in team portal):**
```
Composed by Conversion Copy · routed via GPT-5 · BIO v7 · certified by Marina · 14 May · run 78f3b21
```

**Why the split:** the model name leaks vendor identity to clients who don't care, and *"GPT-5"* is engineering-speak that dilutes the strategic chip (`certified by Marina`). The model is a team-side trust signal — for ourselves, for ops debugging, and for the AI-SEO docs (§8) where *"routed via Haiku for X, Sonnet for Y"* is part of the public moat story at the **concept** level (not the per-output level). On the per-output card facing the client, the Steward attribution leads.

Zero new data: all fields exist on `runs.bio_version` + `bios.certified_by` + `bios.certified_at` + `runs.model_used`. Two render functions, one data source. Ship in P3.

### 5.6 Brand churn — what survives a cancellation (locked)

When a Tier 02 / Tier 03 subscription cancels:

- **BIO data** is preserved in DB for **90 days** post-cancellation (recoverable on re-subscribe with no friction). After 90 days, archived to cold storage; recoverable on written request for 1 year; then purged.
- **Certified BIO version stays frozen.** The Steward attribution (`certified_by`, `certified_at`, `cert_kind`) persists on the historical `bios` row **indefinitely** — we never retroactively strip the Steward chip from past outputs. Marina certified Vinilo's BIO on 14 May; that fact remains true regardless of subscription status.
- **OutputCard footer on past outputs** continues to render `certified by Marina` for as long as the workspace exists. Provenance is immutable.
- **Re-subscribe within 90 days** restores the certified BIO at its last-certified version; no re-cert required (the BIO is read-only during the lapse, so it cannot drift).
- **Re-subscribe after 90 days** requires a fresh onboarding certification (same flow as a new brand).

**Principle:** data that *proves the moat* (Steward attribution, certified history) is permanent. Data that *drives ongoing work* (BIO editing, drift cadence) decays with the subscription. **The chip is forever; the cadence is paid.**

---

## 6. Tier inclusion — who gets what — LOCKED 2026-05-24

The whole plan binds to monetisation here. `CI_TIERS` = `{ "00":"Free", "01":"Studio", "02":"Brandolph", "03":"Suite" }`.

**Concept primer for engineer:**
- **Workspace** = the tenant boundary (auth, RLS, billing). One subscription = one workspace.
- **Brand** = a BIO + its own canon, lives inside a workspace.
- **Seats** = number of users with access to a workspace.
- **Additional workspaces** = sold as separate subscriptions (each at its own tier). Same payment account can hold many workspaces.

### 6.1 The tier matrix

| Capability | 00 Free | 01 Studio | 02 Brandolph | 03 Suite |
|---|---|---|---|---|
| **Auto mode** | demo brief only (sample brand, Auto only, 50 cr cap) | ✓ | ✓ | ✓ |
| **Manual mode (Canvas)** | — | ✓ | ✓ | ✓ |
| **Templates accessible** | **None in V1** (no `tier_from='00'` seeded) | tier_from ≤ '01' | tier_from ≤ '02' | tier_from ≤ '03' |
| **BIO Steward — onboarding** | — | add-on 50 cr | **included (0 cr)** | **included (0 cr)** |
| **BIO Steward — quarterly drift check** | — | — | **15 cr/check (cap 4/yr)** | **included, unlimited** |
| **Monthly credit pool** | 50 cr (demo only) | 300 cr | **900 cr** | **2500 cr (shared across brands)** |
| **Seats per workspace** | **1** | **2** | **3** | **5** |
| **Brands per workspace** | 1 (demo brand only) | 1 | 1 | **5 brands max, shared credit pool** |
| **Additional workspaces** | — | sold as separate subscription at any tier | sold as separate subscription at any tier | sold as separate subscription at any tier |
| **Output attribution (model + Steward chip)** | ✓ public | ✓ | ✓ | ✓ |
| **AI-queryable specialist docs (§8)** | ✓ public | ✓ public | ✓ public | ✓ public |

### 6.2 Pool sufficiency assumption — credit math at scale

- Tier 02: 900 cr / 1 brand = **900 cr/brand**. Locked.
- Tier 03: 2500 cr / 5 brands = **500 cr/brand average**. Less than Tier 02 per-brand, but agencies pool across utilization curves — not every brand spikes simultaneously.
- **Tripwire to watch in P7+:** if Suite churn correlates with "brand 5 starved of credits at month-end," bump the pool to 3500–4000 cr without changing brand cap.

### 6.3 Strategic gating logic

- **Steward certification is the upsell hook into Tier 02.** It's the single feature most easily understood ("a senior human will review your brand") and most expensive to fake. Putting it at 02 (and not 01) protects Brandolph as the "real product" tier.
- **Manual mode at Tier 01** is deliberate — the playground is what justifies paying over Free. Free users only see the Auto-on-sample-brand demo.
- **Template gating** is per-template via `template_versions.tier_from`. Not hard-coded by template id. La Mesa can promote a template from Tier 02-only to Tier 01-accessible by editing one field.
- **Tier 03 = the agency tier.** Shared credit pool, 5 brands, 5 seats — covers small agencies. Anyone needing more brands/seats than the cap converts to a custom Enterprise deal, not a self-serve upgrade.
- **Why Suite > 5× Brandolph for agencies** (the buyer argument, locked):
  - **Seats:** Suite = 5 seats in one workspace. 5× Brandolph = 15 seats nominal but 5 isolated billings, 5 logins, 5 settings panels to manage.
  - **Pooled burn:** brands rarely spike simultaneously; one brand's quiet month subsidises another's launch week. 5× Brandolph at 900 cr/brand strands credits in low-utilisation brands.
  - **Single Steward bench:** one drift cadence across the portfolio (included unlimited on Tier 03). 5× Brandolph means 5 separate drift checks at scaling cr each.
  - **Central oversight:** one Briefs library, one Library, one Specialists directory — the agency sees the portfolio, not 5 disconnected workspaces.
  - **Honest counter-case:** an agency running 5 brands at sustained ~900 cr/month each (~4,500 cr aggregate) is **not** the Suite buyer — they belong on Enterprise. Suite's pool is calibrated for portfolios where utilisation averages out, not 5 brands at full burn.
- **Free tier has no templates in V1.** The `tier_from = '00'` slot exists in the schema for a future seeded demo template if conversion data justifies it; the current Free experience is one Auto brief on a sample brand, 50 cr cap, then upgrade prompt.
- **Additional workspaces ≠ additional brands.** Two different needs:
  - "I want isolated billing per client" → buy another workspace (separate subscription).
  - "I want central oversight across client brands" → use the multi-brand cap inside one Suite workspace.

---

## 7. Canvas + workspace mode (Pletor borrow #1)

The Canvas is no longer a Phase-3 placeholder. Per §3.3, it becomes the Manual editor on the client side. Per §6, it becomes a full power surface on the team side. The Canvas also drives a global workspace behavior:

**Workspace mode** — when the user is inside Manual or a brief detail, the shell compresses:
- Sidebar nav goes **floating** with hover-reveal labels (already prototyped — extend the pattern).
- Topbar breadcrumbs collapse to a thin context strip.
- The Canvas dominates the viewport.

This is a global state, not a Canvas-only behavior. Same primitive Figma/Linear use. Implement once, reuse for any "focus" workspace later.

Implementation: a `ShellMode = "default" | "workspace"` boolean set by route. `brief-detail`, `canvas`, and the new Manual editor route all set `workspace`. Everything else stays `default`.

---

## 8. AI-queryable docs (Pletor borrow #2 · the AI-SEO play) — LOCKED 2026-05-24

Pletor exposes every doc page with an `?ask=<question>` query parameter that returns an LLM-friendly answer. This makes their docs AI-native: any agent integrating Pletor can self-serve, and Pletor becomes citable inside Claude/ChatGPT/Perplexity.

We ship this **from day one of public docs (P8)**. Pattern (domain TBD — Caastor-controlled subdomain, e.g. `docs.<caastor-domain>`):

```
GET {docs}/specialists/a12-conversion-copy.md
GET {docs}/specialists/a12-conversion-copy.md?ask=when+should+I+use+this
GET {docs}/templates/the-launch.md?ask=what+does+it+output
GET {docs}/concepts/bio.md?ask=how+is+the+BIO+certified
```

Every L2 specialist gets a queryable `.md` page. Every template gets one. Every core concept (BIO, Steward, Modes) gets one. Brandolph itself can query its own spec corpus.

### 8.1 Vendor: Nextra (locked)

Picked over Mintlify and VitePress because:
- **Full control over `?ask=` endpoint.** Mintlify's hosted AI assistant is generic chat-over-docs; we need a custom endpoint piping into Haiku **with our DB as context** (so it can answer "which template is best for SaaS launch?" by reading the actual `template_versions` table). Only Nextra (Next.js API routes) gives us that.
- **Same React/JS ecosystem** as the SPA — no new language for the team.
- **Cheap on Vercel** (free tier covers it).

### 8.2 Infra split (recommended)

```
{root-domain}        → marketing site (separate; Framer or Nextra)
{app-subdomain}      → the React/Vite SPA (existing CaastorOS)
{docs-subdomain}     → Nextra docs site (NEW; P8)
```

Three frontends, one Supabase backend. Docs reads public-read views on `template_versions`, `industries`, `specs`.

### 8.3 Content sourcing — hybrid

- **Concept / foundational pages** (`/concepts/bio`, `/concepts/modes`, `/concepts/stewards`) — hand-written MDX in repo.
- **Auto-generated pages** (`/specialists/[id]`, `/templates/[slug]`, `/industries/[slug]`) — pulled from DB at build / via Next.js ISR. Edit a template in admin → docs page auto-updates.

Both expose `?ask=` at the page level. Same Haiku-with-context pattern.

### 8.4 Repo + lifecycle

- **Separate repo** (`caastor-docs`) — not in the SPA monorepo. Keeps deploys independent; non-engineers can be granted write access to docs MDX without touching the app.
- **`?ask=` ships in the first P8 release** — not deferred. Without it, the docs site is just a marketing site; the AI-SEO play depends on it from day one.

**Docs URL versioning (locked):** docs pages reflect only the **active** `template_version` at build time (Next.js ISR refreshes on the `active` flag flip). Briefs pinned to v3 do not get a `docs/the-launch@v3.md` URL. Version drift between docs and historical briefs is accepted as a known limitation — La Mesa maintains a changelog in the template's MDX intro. Briefs that reproduce a v3 run still produce identical outputs (because they're pinned to `template_version_id`); external docs simply describe the current (e.g. v5) assembly. If reproducibility-with-docs becomes a customer ask later, we add `?v=N` query support — not before.

### 8.5 `?ask=` data allowlist (locked)

The Haiku-with-DB-context pattern queries only an explicit allowlist of public-read views — **never raw tables**.

**Allowlisted (read-only, served via dedicated Postgres views):**

```
public_template_versions   // active versions only; outcome, assembly (specialist ids, NOT specs),
                           // expected_output_kinds, estimate_credits, tier_from, industries
public_industries          // active rows; multilingual labels
public_specs               // a01–a33 metadata: name, role_label, department, public_description
                           // NEVER: prompt_template, model_routing internals, training references
public_concepts            // hand-written MDX (bio, modes, steward, etc.)
```

**Never accessible via `?ask=`:**
- `bios.*` (any brand canon — even anonymised)
- `runs.*` (any output history)
- `brands.*`, `workspaces.*`, `users.*`
- `specs.prompt_template` or any internal prompt scaffolding
- `team_members.hourly_rate_cents` or any cost / rate data
- `steward_jobs.*`

**Defense in depth — three layers:**
1. The Nextra API route runs as a Supabase service role limited to the allowlisted views (not the underlying tables).
2. Postgres RLS on the underlying tables denies the service role even if the view layer is bypassed.
3. The Haiku system prompt explicitly forbids returning column values for any field outside the allowlist; the response goes through a regex scrubber before render.

Any one layer should hold; two of them holding is the design point.

Pair with `anthropic-skills:ai-seo` for content optimisation.

---

## 9. Model attribution on outputs (Pletor borrow #3)

Already covered in §5.5 — adding here as its own line item for the engineer.

**Two render targets, one data source (locked — see §5.5 for rationale):**

```
Client (default, public):
  Composed by {specialist.name} · BIO v{n} · certified by {steward.firstName} · {date}

Team / debug (hover-reveal client-side; default-visible in team portal):
  Composed by {specialist.name} · routed via {model.label} · BIO v{n}
                                · certified by {steward.firstName} · {date} · run {short_id}
```

All fields already exist (`runs.specialist_id`, `runs.model_used`, `runs.bio_version`, `bios.certified_by`, `bios.certified_at`). Two render functions, no schema delta. Ship in P3.

---

## 10. Data model deltas

Additions to the schema in `apis-and-agents-plan.md §5`. Nothing in that schema is replaced — everything below is additive.

```sql
-- §5 Stewards / human team — a team member can hold MULTIPLE roles
team_members (
  id, name, first_name, avatar_url,
  roles text[],                              -- subset of ('steward', 'l3_craft', 'ops', 'lead_steward')
  active boolean, hourly_rate_cents, created_at
)
-- Per §5.1 rotation rule: track which brands a team member actively crafts on,
-- so steward_jobs assignment can exclude them. Derived from `runs` table — no new column needed.

-- §5 BIO certification
ALTER TABLE bios ADD COLUMN certified boolean DEFAULT false;
ALTER TABLE bios ADD COLUMN certified_by uuid REFERENCES team_members(id);
ALTER TABLE bios ADD COLUMN certified_at timestamptz;
ALTER TABLE bios ADD COLUMN steward_notes text;     -- free-text from Steward, visible to client
ALTER TABLE bios ADD COLUMN cert_kind text;          -- 'onboarding' | 'drift_check' | null

-- §5 Source intake buckets
ALTER TABLE bio_sources ADD COLUMN bucket text;      -- 'foundations' | 'visual' | 'voice'

-- §5 Steward job queue
steward_jobs (
  id, bio_id, brand_id, kind,                        -- 'onboarding' | 'drift_check' | 're_extract'
  status,                                            -- 'queued' | 'in_review' | 'completed'
  assigned_to uuid REFERENCES team_members(id),
  queued_at, completed_at,
  credits_charged int,
  outputs_reviewed_count int,                        -- §5.4 drift volume tier (drives pricing)
  lead_reviewed_by uuid REFERENCES team_members(id), -- §5.1 calibration phase + spot checks
  lead_reviewed_at timestamptz,
  override_reason text                               -- §5.1 capacity fallback log
)

-- §4 Industries — editable taxonomy (CMS-style, not enum)
industries (
  id, slug,                                          -- 'hospitality_fnb' stable
  label_en, label_es, label_it,                      -- multilingual for La Mesa markets
  display_order int,
  active boolean DEFAULT true,                       -- soft delete; archived industries fall back to 'broad'
  created_at, archived_at
)

-- §4 Templates — split into stable + versioned (mirrors specs versioning per apis-and-agents-plan §4.3)
templates (
  id, slug,                                          -- stable identifier; AI-SEO target
  name, tagline,                                     -- editable but rarely
  created_at, archived_at
)
template_versions (
  id, template_id, version,
  outcome,
  brief_skeleton jsonb,
  assembly jsonb,                                    -- ordered specialist ids
  expected_output_kinds text[],
  qa_gates jsonb,
  estimate_credits int,
  industries text[],                                 -- ['hospitality_fnb','consumer_brand']; FK by slug
  objectives text[],                                 -- ['launch','retention']
  featured boolean DEFAULT false,
  featured_priority int,
  tier_from text,                                    -- '00'..'03'
  status text,                                       -- 'draft' | 'live' | 'archived'
  active boolean,                                    -- exactly one active row per template_id
  created_by uuid REFERENCES team_members(id),
  created_at, last_used_at
)

-- §4 Brands gain an industry tag (inferred + user-confirmed)
ALTER TABLE brands ADD COLUMN industry text;                          -- FK to industries.slug
ALTER TABLE brands ADD COLUMN industry_confidence float;              -- 0..1; from a30 BIO Compiler
ALTER TABLE brands ADD COLUMN industry_source text;                    -- 'inferred' | 'user_confirmed' | 'user_set'

-- §3 Manual mode runs
ALTER TABLE briefs ADD COLUMN mode text DEFAULT 'auto';                            -- 'auto' | 'manual' | 'template'
ALTER TABLE briefs ADD COLUMN template_version_id uuid REFERENCES template_versions(id); -- when mode = 'template'; PINNED at creation
ALTER TABLE briefs ADD COLUMN assembly_override jsonb;                             -- when mode = 'manual': the user-edited assembly
```

**Why on `briefs` not `runs`:** mode is a property of the brief (what the user chose to do), not of each individual specialist run. The run is the same regardless of mode — only the assembly differs.

---

## 11. API surface deltas

Additions to `apis-and-agents-plan.md §3.2`. New endpoints:

```
# Templates — surfaced + browse
GET    /api/templates                     → top 5 ranked for the brand (industry match → featured → recency)
GET    /api/templates/all                  → full library for the /templates browse page
GET    /api/templates/:slug                → full active template_version (briefSkeleton, assembly, estimates)
POST   /api/briefs/from-template          { templateSlug, brandId }
                                          → resolves slug to active template_version_id (PINNED at brief creation)
                                          → returns { briefId, templateVersionId, sharpened }
                                          Optional admin/test override:
                                          { templateSlug, brandId, templateVersionId } to pin a non-active version
POST   /api/bios/:brandId/re-extract       { sources?: bio_source_ref[] }
                                          → drafts candidate bios row (certified=false)
                                          → enqueues steward_job (kind='re_extract')
                                          → charges 30 cr (Tier 01+; rejected on Free)
                                          → returns { candidateBioVersion, stewardJobId }

# Industries — read-only public + admin CRUD
GET    /api/industries                    → active industries (public; for "change industry" UX)
POST   /api/admin/industries              admin only — create
PATCH  /api/admin/industries/:id          admin only — edit / archive
POST   /api/admin/templates               admin only — create draft
PATCH  /api/admin/template-versions/:id   admin only — edit draft / promote to live (flips active)

# Manual mode (assembly editing)
PATCH  /api/briefs/:id/assembly           { add[], remove[], reorder[] } → { newAssembly, newEstimate }
POST   /api/briefs/:id/run                { mode: "auto"|"manual"|"template" } → { runIds[] }

# Brand Steward
POST   /api/bios/:brandId/request-cert    { kind: "onboarding"|"drift_check" } → { jobId }
GET    /api/steward/jobs                  → queued jobs (team-side, role-gated)
PATCH  /api/steward/jobs/:id              { status, notes, bioPatch } → { newBioVersion }
GET    /api/bios/:brandId/cert            → { certifiedBy, certifiedAt, notes }
```

Role-gating: `/api/steward/jobs` requires `team_members.role = 'steward'` on the session user. Re-uses Supabase RLS pattern from §3.2.

---

## 12. Sequencing — slotting into the existing P0→P8

Mapping every item in this doc to the build phases in `apis-and-agents-plan.md §6`. Nothing here breaks the existing sequence — each addition lands inside or just after an existing phase.

| Phase | Existing scope | + ADD from this plan |
|---|---|---|
| **P0** | Backend skeleton, first streaming call | **§2 Naming fix** (label rename only — pre-API, ship today). Also: design the new `ShellMode` primitive (§7). |
| **P1** | Discovery → BIO live | **§5.3 Three-bucket source intake** (Discovery upload UX + `bio_sources.bucket` field). |
| **P1.5** *(new)* | — | **§5 Brand Steward certification onboarding pass.** Team-side queue + UI + credit charge + `bios.certified_*` fields. Ships before P2 so the first real brief runs against a certified BIO. |
| **P1.6** *(new)* | — | **§4.5 Industry inference + confirmation in Discovery.** a30 BIO Compiler outputs `industry` + confidence; user confirms in Discovery's last step. `industries` table seeded. `/admin/industries` CRUD shipped (~1 hr). |
| **P2** | Brief sharpening + clarifications | No additions — keep scope. |
| **P3** | First production specialist run + QA gate | **§9 Model + Steward attribution on OutputCard** (render change, data already exists). |
| **P4** | Text fan-out | **§4 Templates 2 + 5** (Awareness Sprint, Lifecycle — text-only assemblies, viable here). Industry tagging + surface logic live. |
| **P5** | Image specialist + storage | **§4 Template 1 (Launch)** (needs Hero KV image gen — depends on P5). **§3.3 Manual mode Canvas v1** (text + image specialists only; defer composed-output specialists). |
| **P6** | Composed outputs (v0 / Gamma) | **§4 Templates 3 + 4** (Pricing Move, Identity Set). **§3.3 Manual mode v2** (all specialists now available). |
| **P7** | Multi-tenant + Stripe + tier gates | **§6 Tier inclusion** — enforce template `tierFrom`, Manual mode access, Steward inclusion at Tier 02+. |
| **P7.5** *(new)* | — | **§5.4 Recurring quarterly drift check** — scheduled job + Steward queue + client-side chip. |
| **P8** | Soon→live + motion + ops | **§8 AI-queryable docs site** ship — auto-generated from `template_versions` + `industries` + `specs` tables. Concurrent with this phase since docs build is independent of runtime. |
| **P9** *(new, post-P7)* | — | **§4.2 Full template admin UI** in team portal. Reuses Manual mode Canvas as the assembly editor. Industry-specific templates added as client signal arrives. |

**Critical path note (corrected from earlier draft):** P1.5 (Steward) **gates P3** — the first production specialist run reads a certified BIO. Earlier wording said *"blocks no other engineering work"*; that was wrong. P1.5 is **on** the critical path: P0 → P1 → P1.5 → P1.6 → P2 → P3. The Steward flow must be production-grade (team queue, assignment, cert UI, credit charge, `bios.certified_*` fields) before any client brief runs against a real (non-sample) brand. Plan staffing accordingly — this is the load-bearing bottleneck, not a parallel marketing flourish.

The P3 row in the table above implicitly assumes a certified BIO; we are calling it out explicitly here because the original phrasing under-resourced P1.5.

---

## 13. Open decisions

_All seven original open items were locked on 2026-05-24 — see §16 rows 1–7. The 2026-05-24 rev 2 pass added a further set of locks (tripwires, scaling rules, churn behavior, allowlist, etc.) logged as §16 rows 8–20. **There are no remaining open decisions blocking P0 within the scope of this plan.**_

_Out-of-plan items the engineer should still confirm before kicking off P0:_

1. **Domain assignment** — `caastor-controlled subdomain` for docs (§8) is TBD pending the marketing site decision.
2. **Steward hourly rate** — assumed €40/hr in §5.2 cost math; confirm actual La Mesa rate before the §5.2 tripwire calculation goes live.
3. **Stripe plan IDs** — the Tier 00/01/02/03 mapping in §6 needs the actual Stripe product/price IDs created (ops task before P7).

---

## 14. Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Steward review takes longer than 20 min on average | high | med | Measure across first 20 reviews; if median >30 min, raise sellable price or split into Verify (cheap) + Refine (paid) tiers |
| Manual mode causes credit blowouts (users over-assemble) | med | med | Live cost meter (§3.3) + a soft warning at >2× the Auto estimate |
| Template library bloats over time | med | low | Auto-pruning rule in §4 (90-day inactivity → draft) + 5-surfaced-per-user cap (§4.1) keeps the user-facing surface tight regardless of library size |
| Steward becomes a rubber-stamp role (junior staffing) | med | catastrophic | Hiring discipline — La Mesa-trained only; cap at 2–3 named Stewards V1 |
| AI-queryable docs leak prompt/spec internals (team-only fields) | med | high | Separate `public.md` views from team-side spec views; never serve `specs.prompt_template` to the public docs route |
| "Specialist Humans" naming lingers in copy elsewhere | low | low | Repo-wide grep before P1 ship; add to glossary CI check |
| Manual mode lets users skip QA via assembly edit | low | catastrophic | Server-side enforcement: assembly endpoint always appends a18 + a24 if missing; UI cannot remove them |

---

## 15. What ships first (recap — honest ordering)

If we can only ship three things from this plan before P0 starts, ship them in this order:

1. **§2 Naming fix** (5 min — `Specialists` + `Humans`). **User-visible value.**
2. **§5.3 Three-bucket source intake on Discovery** (small — unblocks Steward review at P1.5). **User-visible value.**
3. **§7 `ShellMode` primitive** (1–2 days — internal scaffolding; no user value alone but unblocks Canvas-as-Manual at P5). **Plumbing.**

Honest framing for stakeholders: the first two ship value; the third is infrastructure. Don't claim *"three user-visible wins"* in the readout when one is plumbing.

The load-bearing product-strategy decisions in this plan — the lines to hold even under scope pressure — are:

- **5 surfaced templates per user** (§4.1), not 5 ever existing.
- **Steward onboarding cert included on Tier 02+** (§5.2), with the §5.2 tripwire as the safety valve.
- **Manual mode cannot cold-start in V1** (§3.3) — the V2 veteran exception is the only sanctioned deviation.
- **Steward attribution is permanent** (§5.6) — survives churn, never retroactively stripped.
- **Public OutputCard footer leads with the Steward chip, not the model** (§5.5 / §9) — the moat is the human, not the vendor.

If a scope cut threatens any of those five, escalate — they are not negotiable line items. See §17 for why.

---

---

## 16. Decisions log

Decisions locked through review with Oscar. Open items remain in §13.

| # | Decision | Status | Date | Resolution |
|---|---|---|---|---|
| 1 | Steward credit pricing | **LOCKED** | 2026-05-24 | Option C: onboarding cert bundled (0 cr) on Tier 02+; 50 cr add-on on Tier 01; quarterly drift check 15 cr/check on Tier 02 (cap 4/yr), included unlimited on Tier 03. Assumptions held pending confirmation: €40/hr Steward rate, quarterly cadence. See §5.2. |
| 2 | Template count & curation | **LOCKED** | 2026-05-24 | 5 surfaced per user (not 5 ever existing). Library editable + versioned + soft-deletable. Industries editable taxonomy (not enum). Surface ranking: industry match → featured → recency. 5 broad templates locked for V1 core. Industry-specific templates added post-launch from real client signal. Admin tooling: Supabase Studio + tiny `/admin/industries` CRUD in V1; full team-portal admin route in V2. See §4. |
| 3 | Tier inclusion matrix | **LOCKED** | 2026-05-24 | Free = 1 demo brief on sample brand (50 cr, Auto only). Credit pools: 50/300/900/2500. Seats: 1/2/3/5. Brands/workspace: 1/1/1/5 (Suite multi-brand with shared pool). Additional workspaces sold as separate subscriptions. Template gating per-template via `tier_from`, not hard-coded. See §6. |
| 4 | IA structure + L3 label | **LOCKED** | 2026-05-24 | 4 sections × 2 children each. Section eyebrows ARE the contents (slash-joined): Create / Briefs · BIO / Library · Specialists / Humans · Credits / Account. L3 label = "Humans" (replaces "Human craft"). New `/library` route added for source intake. Canvas = workspace state, not a nav item. Stewards = sub-group inside Humans. See §2. |
| 5 | Manual mode on Free tier | **LOCKED** | 2026-05-24 | Option (a) Locked — no Manual access on Tier 00. Free users see Auto on sample brand only. No "Adjust assembly" link surfaces. Post-demo upgrade prompt: *"Run this on your brand — upgrade to Studio →"*. One conversion reason per tier transition. See §6. |
| 6 | AI-queryable docs vendor | **LOCKED** | 2026-05-24 | Nextra on Vercel. Separate `caastor-docs` repo. `?ask=` endpoint pipes into Haiku with DB context. Hybrid content (MDX for concepts, DB-generated for specialists/templates/industries). Domain TBD — Caastor-controlled subdomain. Ships in P8 with `?ask=` from day one. See §8. |
| 7 | Brand Steward bench | **LOCKED** | 2026-05-24 | Stewards = senior L3 designers in rotation, not new hires. 2–3 cross-trained designers at launch (3+ required for clean rotation). ~15–20% of their time on Stewardship; rest stays on craft. Hard rule: a Steward never certifies a brand they actively craft on (rotation enforcement). Hiring owner V1 = La Mesa ops. Separate Ops Plan to follow this spec. See §5.1. |
| 8 | Steward cost tripwire | **LOCKED** | 2026-05-24 (rev 2) | If absorbed cert cost sustains >€25/cert over rolling 30 days (proxy: ~30 min median review), flip Tier 02 onboarding cert from 'included (0 cr)' to a visible 50 cr line item (matching Tier 01). Tier 03 unchanged. Re-evaluate after next 30-day window. See §5.2. |
| 9 | Steward capacity fallback | **LOCKED** | 2026-05-24 (rev 2) | If no eligible Steward available within 24h SLA window (PTO, rotation exclusion, load), Lead Steward overrides the rotation rule for that cert; logged in `steward_jobs.override_reason`. If Lead also unavailable, SLA auto-extends to 48h with in-app client notification. No silent slippage. See §5.1. |
| 10 | Drift-check pricing scales by volume | **LOCKED** | 2026-05-24 (rev 2) | Tier 02 drift cert price tiers: ≤25 outputs = 15 cr (full read), 26–75 = 25 cr (sampled), 76+ = 40 cr (sampled). Surfaces in-app before opt-in. Tier 03 unlimited at all volumes. See §5.4. |
| 11 | OutputCard footer — two render modes | **LOCKED** | 2026-05-24 (rev 2) | Client footer (default, public): `Composed by {specialist} · BIO v{n} · certified by {steward} · {date}`. Team/debug footer adds `routed via {model}` + `run {short_id}`. Model attribution removed from public client view — Steward chip leads. See §5.5 + §9. |
| 12 | Brand churn — Steward attribution permanent | **LOCKED** | 2026-05-24 (rev 2) | BIO data preserved 90 days post-cancel; archived to cold storage for 1 year; then purged. Certified BIO + Steward attribution on past outputs frozen indefinitely — never retroactively stripped. Re-subscribe ≤90d restores; >90d requires fresh cert. See §5.6. |
| 13 | Manual mode model picker — role-gated render | **LOCKED** | 2026-05-24 (rev 2) | Single Canvas component, no UI bifurcation. Model picker renders only when `team_members.roles ∩ ['ops','lead_steward'] ≠ ∅`; client UI never shows it. Server endpoint re-validates the role check on `modelRouting` override. See §3.3. |
| 14 | Veteran Manual cold-start exception | **DEFERRED to V2** | 2026-05-24 (rev 2) | After ≥10 briefs on a single brand, an opt-in `brand_settings.manual_cold_start_enabled` surfaces a 'Start in Manual →' secondary action on the composer. NOT in V1 — ships only if veteran-abandonment data justifies it. See §3.3. |
| 15 | Re-extract from BIO — cost + queue | **LOCKED** | 2026-05-24 (rev 2) | 30 cr (Tier 01+; rejected on Free). Drafts candidate `bios` row (`certified=false`), queues Steward drift-style review (counts against Tier 02 quarterly cap; included Tier 03). Currently certified version stays active until candidate certifies. See §2.1 + §11. |
| 16 | `?ask=` docs allowlist | **LOCKED** | 2026-05-24 (rev 2) | Three-layer defense (service-role views + RLS + Haiku scrubber). Allowlisted: `public_template_versions`, `public_industries`, `public_specs` (metadata only — never `prompt_template`), `public_concepts`. Never: `bios`, `runs`, `brands`, `workspaces`, `users`, `specs.prompt_template`, `team_members.hourly_rate_cents`, `steward_jobs`. See §8.5. |
| 17 | Docs URL versioning | **LOCKED** | 2026-05-24 (rev 2) | Docs reflect only the active `template_version` at build time. No `@v3` URL variants in V1. Historical briefs reproduce identically against pinned `template_version_id`; external docs describe current. Add `?v=N` only if customer demand surfaces. See §8.4. |
| 18 | Free tier — no templates in V1 | **LOCKED** | 2026-05-24 (rev 2) | No `tier_from='00'` templates seeded; Free = one Auto brief on sample brand, 50 cr cap, upgrade prompt. The schema slot exists for a future demo template if conversion data justifies it. See §6.1 + §6.3. |
| 19 | Suite (Tier 03) buyer argument | **LOCKED** | 2026-05-24 (rev 2) | Suite > 5× Brandolph for agencies because of: seats (5 in one workspace vs 15 fragmented), pooled credit burn (averages utilization curves), single Steward bench (unlimited drift), central oversight. Agencies running 5 brands at sustained ~900 cr each belong on Enterprise, not Suite. See §6.3. |
| 20 | P1.5 on the critical path | **LOCKED** | 2026-05-24 (rev 2) | Correction to §12: P1.5 (Steward) gates P3 (first production run). Earlier "blocks no other engineering work" framing was wrong. Resource P1.5 as a sequence-critical phase, not a parallel marketing flourish. See §12. |

---

## 17. Moat reinforcement — what makes this defensible

The user's brief on this rev: *"impeccable experience and a definitive moat and USP that is strong."* This section names the moat-load-bearing decisions so that when scope pressure hits in P3 / P5 / P7, the team knows which lines to hold.

### 17.1 The USP, written plainly

> Pletor / Gamma / Lovable expose nodes and prompts; the user composes.
> Caastor hides the nodes; **Brandolph composes, and a senior human certifies the brand canon every specialist reads from.**

The product that wins this category is not the one with the cleverest node graph — it is the one whose outputs feel like they came from someone who *knows the brand*. That knowing is encoded in the certified BIO. Every specialist reads it. Every output is footer-stamped with the human who certified it. **That is the USP. It is not a feature; it is the architecture.**

### 17.2 The five moat pillars (in priority order)

1. **The certified BIO — versioned, immutable history, senior-human signed.** No other tool in this space ships a brand canon that is (a) extracted by AI, (b) verified by a senior human, (c) version-controlled, (d) read by every downstream specialist, and (e) attributed on every output forever. A competitor can clone the UI; cloning the Steward operation is a hiring + ops problem, not a software problem.

2. **The Steward chip on every output (`certified by Marina`).** Free to render, impossible to fake without a real operation, becomes the moment-of-trust at every output review. Survives churn (§5.6). Highest-leverage trust signal we ship.

3. **Role-shaped specialists with versioned, immutable specs.** The 33 specialists are not prompt templates — they are role-shaped agents with `prompt_template`, `model_routing`, `qa_gates`, and versioned specs (`apis-and-agents-plan.md §4.3`). A competitor cloning the surface UI cannot replicate the assembly logic without the spec corpus, which never leaves the team-side store. The `?ask=` allowlist (§8.5) is the gate that prevents leakage.

4. **The QA gates that always fire (a18 Voice QA + a24 Brand Consistency QA).** Cannot be skipped, even in Manual mode (§3.3 + §14 server-side enforcement). Every output passes a brand-consistency check before it lands. Competitors that let users skip QA for speed will produce off-brand outputs at scale; we will not.

5. **The Auto-first composer (no node graph as the entry door).** Pletor's failure mode is the blank canvas — the user does not know what to compose. Brandolph's strength is that the BIO + the brief sharpening + the proposed assembly removes that cognitive load. Manual exists for veterans; Auto is the product. (§3.1, §3.3, §3.4)

### 17.3 What we deliberately *don't* compete on

- **Speed of first generation.** Competitors will be faster on cold-start. We are slower because we read the BIO, sharpen the brief, and propose an assembly. That is the product.
- **Number of templates.** Competitors will have 100+. We will have 5 surfaced, named, opinionated (§4.1).
- **Exposed model routing as a user choice.** Clients don't pick GPT-5 vs Sonnet vs Haiku — Brandolph does. The model is a team-side debug signal (§5.5), not a client knob. We win on outcomes, not on giving the client more sliders.
- **A node graph as the marketing hero.** Manual mode is the Canvas, but it is the *playground* (§3.3), not the headline. The headline is `certified by Marina`.

### 17.4 If a scope cut threatens the moat

The five "lines to hold" from §15 are the contract:

1. 5 surfaced templates (not 5 ever existing).
2. Steward onboarding cert included on Tier 02+ (with the §5.2 tripwire).
3. Manual cannot cold-start in V1.
4. Steward attribution is permanent (survives churn).
5. Public OutputCard footer leads with the Steward chip, not the model.

If a scope cut threatens any of these, the right action is to delay the cut-threatened feature — not to ship the moat-degraded version. **The moat is not a feature; it is the reason the product is paid for.**

---

_End of plan. Refine, push back, and we move to API integration._

# CaastorOS → Ship to Design Partners — 7-Day Plan

> Created 2026-06-07. Goal: **a closed group of 5–10 invited design-partner brands using CaastorOS on a real URL within ~1 week.**
> Decisions locked: **Closed design partners** (invite-only, no public signup) · **You/your team self-cert** BIOs · **Fastest hosting path** (Vercel + Render + Inngest Cloud + Supabase).

## The reframe (why this is a ship plan, not a build plan)

The core product is **already built and committed**: real auth, live Discovery→BIO compile, Steward certification (backend `steward.js` + UI `portal-team.jsx`), briefs→runs→deliverables, human craft handoff. The model router is cost-optimized.

What stands between "built" and "real users" is **not features** — it's:
1. **It's never been run end-to-end with real spend.** Every step is verified at the contract/routing layer only.
2. **No deployment exists.** Localhost-only. (Biggest blocker.)
3. **No cost guardrail.** Credits are *debited* but never *enforced* — no pre-run balance check. A partner could burn unlimited API spend.
4. **No onboarding / invite gating, observability, or support path.**

So the week is: **prove → guardrail → deploy → onboard → dogfood → launch.**

## Portal scope (which surfaces this plan covers)

| Portal | In scope? | Why |
|---|---|---|
| **Client** (Create, Discovery, BIO, Briefs, Canvas, Credits, Account, floater) | ✅ Full | The partner-facing critical path — the whole point of the test. |
| **Team** (`TeamQueue`/`TeamJob` Steward cert, `CraftQueue` polish) | ✅ Yes — load-bearing | Self-cert decision means YOU certify BIOs + polish craft here. Verified S0 (walk it) + S3 (make it solid). Needs `npm run grant:steward` on your account. |
| **Admin** (`portal-admin.jsx` — 55-spec editor, Brandolph memory) | ⚠️ Smoke-test only | Internal tooling, never partner-facing, specs already seeded. Confirm it loads + a spec edit saves; no polish. Deeper admin work is out of scope. |

## API availability (audited 2026-06-07, values masked)

**Every functional key is present — the product runs fully today, locally.**

| Key | Powers | Status |
|---|---|---|
| `ANTHROPIC_API_KEY` | Brandolph (Opus 4.7), premium specialists | ✅ set |
| `OPENROUTER_API_KEY` | Gemini 2.5 Pro (BIO compile), GPT-5, cheap text + QA | ✅ set |
| `FAL_API_KEY` | All images (Flux Pro, Flux Schnell, gpt-image-2, recraft) | ✅ set |
| `FIRECRAWL_API_KEY` | Discovery URL scrape | ✅ set |
| `SUPABASE_URL` / `ANON` / `SERVICE_ROLE` | DB / auth / storage | ✅ set |
| `ALLOWED_ORIGINS` | CORS (reads env — prod-ready, just set the domain) | ✅ set |

**Only gap — for cloud deploy (Sprint 2):**

| Key | Needed for | Status |
|---|---|---|
| `INNGEST_EVENT_KEY` | Inngest Cloud (queue in prod; currently `INNGEST_DEV=1` local) | ❌ add in S2 |
| `INNGEST_SIGNING_KEY` | Inngest Cloud webhook verification | ❌ add in S2 |
| `OPENROUTER_REFERER` | OpenRouter ranking attribution | ⚪ optional |

⚠️ **All keys above were written to `server/.env` (and some pasted in chat historically) — Sprint 1 rotates them before anything is exposed.**

## Spend assumptions (estimates — Sprint 0 calibrates with real numbers)

Pricing: Opus 4.7 $5/$25 per 1M in/out · Sonnet 4.6 $3/$15 · Haiku 4.5 $1/$5 · Gemini 2.5 Pro ~$1.25/$10 · Flux Pro $0.04/img · Flux Schnell $0.003/img. Prompt caching cuts repeat input ~10×.

| Action | Models | Est. cost |
|---|---|---|
| Discovery → BIO compile (1×/brand) | Firecrawl + Gemini 2.5 Pro | ~$0.10–0.20 |
| Brief sharpening (Brandolph) | Opus 4.7, few calls | ~$0.20–0.40 |
| One brief run → deliverables | 5–12 specialists + 3–8 images (mostly Schnell) | ~$0.30–0.80 typ.; $1.50–3.00 heavy (premium hero) |
| Vision/voice QA per item | Gemini Flash / Haiku | ~$0.0002 (negligible) |
| Human craft polish | your time | ~$0 API |

- **Per active brand** (Discovery + ~3–5 briefs + chat): **~$4–8** light/moderate, up to ~$15 heavy.
- **Whole closed test (5–10 partners): expected ~$40–100; heavy ~$150–300.**
- **Without the Sprint-1 cap, worst case is unbounded** — one partner looping premium-image briefs ≈ $100–150 alone.
- **Guardrail:** seed each workspace ~20–30 briefs of credit (≈ $15–25 real cost), hard-block at zero → total exposure capped at **~$150–250 worst case**. User sees only credits, never dollars.

## Timeline at a glance

| Day | Sprint | Outcome |
|---|---|---|
| **1** (Jun 7) | S0 · Prove the loop | The whole critical path runs once, locally, with real spend. Ranked bug list. |
| **2** (Jun 8) | S1 · Cost guardrail + security | Impossible to run up a surprise bill or breach data. Keys rotated. |
| **3** (Jun 9) | S2 · Deploy to cloud | Full loop works on a real URL from another machine. |
| **4–5** (Jun 10–11) | S3 · Onboarding + polish | A teammate completes the loop solo from an invite, on prod. |
| **6** (Jun 12) | S4 · Observability + soft invite | 1 friendly partner (Vinilo) has produced a certified output on prod. |
| **7** (Jun 13) | S5 · Launch to partners | 5–10 partners invited in waves; feedback loop running. |
| 8 (Jun 14) | — | Buffer / hotfix day. |

Owner tags: **[you]** = only Oscar can do (dashboards, keys, credit-spend approval, certifying, inviting). **[claude]** = code I can do.

---

## Sprint 0 — Prove the loop (Day 1) 🎯 the de-risker

**Goal:** run the entire critical path once, end-to-end, with real API spend, and write down everything that breaks. Until we've *seen* it work once, every later estimate is a guess. This is worth the ~few-dollars of spend.

**Critical path to walk:**
1. Sign up as a brand-new user → trigger creates workspace + brand.
2. Discovery → enter a real URL → `POST /discovery/start` → compile-bio (firecrawl scrape + Gemini 2.5 Pro) → BIO row lands, Discovery screen flips to "done".
3. Review BIO in BioViewer; make one edit → `PATCH` → new version.
4. **[you]** In Team portal → Steward queue → certify the BIO → cert chip flips on the client side.
5. Create a brief → Brandolph sharpens → assembles crew → run (`POST /runs/stream`) → deliverables render on the canvas.
6. Click a deliverable → "Send to human" → **[you]** polish in Team "Craft polish" → delivered back onto the card.

**Tasks**
- [ ] **[you]** Run `npm run dev:all`; **[claude]** watch all three logs (web/api/inngest).
- [ ] Walk the 6 steps above; **[claude]** capture each failure with the log line.
- [ ] **[claude]** Triage into P0 (blocks the loop) / P1 (ugly but passable) / P2 (later).
- [ ] **[claude]** Fix P0s inline where safe; queue P1s for Sprint 3.

**Definition of done:** the loop completes at least once locally; a ranked bug list exists. **Budget:** one full run's worth of spend (~a few $), pre-approved.

---

## Sprint 1 — Cost guardrail + security (Day 2) 🔒 the gate before exposure

**Goal:** make it impossible for a test user to run up a surprise bill or reach another workspace's data. Nothing gets exposed until this is done. Directly serves your standing rules ("don't waste credits", "only show credits to the user").

**Tasks — credit enforcement (the #1 gap)**
- [ ] **[claude]** Add a derived-balance helper (sum `ledger.credits` per workspace) — the missing `balance_after` / balance view.
- [ ] **[claude]** **Pre-run balance check**: `runs.js POST /stream` and `craft.js POST /` reject with a clean `402 / "out of credits"` *before* any model call when balance < the run estimate. (Today they debit only *after* work — no ceiling.)
- [ ] **[claude]** Per-workspace **hard monthly cap** + per-run sanity cap (env-configurable).
- [ ] **[you]** Seed each partner workspace with a fixed credit grant (e.g. enough for ~N briefs); document the grant size.
- [ ] **[claude]** Reconcile the flat-`cr_estimate` debit with actual deliverable count (the `runs.js` TODO) so credits ≈ real cost.

**Tasks — security**
- [ ] **[you]** Rotate **every** key pasted in chat: Anthropic, OpenRouter, fal.ai, Supabase service-role, Supabase PAT. (Flagged repeatedly in the implementation log.)
- [ ] **[you]** Supabase → Auth → turn **email confirmation ON** (closed test = real emails).
- [ ] **[claude]** Run `/security-review` on the server + RLS; fix any P0. Confirm RLS workspace-isolation on every client-facing table + `service-role-only` paths.
- [ ] **[claude]** Light rate-limit on `/runs/stream` + `/discovery/start` (per-workspace, in-memory is fine for closed test).

**Definition of done:** a run on a 0-balance workspace returns a clean "out of credits" (no 500, no silent spend); `/security-review` shows no P0; all keys rotated.

---

## Sprint 2 — Deploy to cloud (Day 3) 🚀 the biggest blocker

**Goal:** the app is reachable on a real URL by someone who isn't on your laptop. Recommended fastest path:

| Layer | Host | Why |
|---|---|---|
| SPA (Vite static) | **Vercel** (or Netlify) | Zero-config static, instant; set `VITE_*` env. |
| API (Hono on Node) | **Render** (or Railway) | Dead-simple Node web service; set all keys + `ALLOWED_ORIGINS`. |
| Queue | **Inngest Cloud** | Register the app, set `INNGEST_EVENT_KEY` + `INNGEST_SIGNING_KEY`. |
| DB/Auth/Storage | **Supabase** (already cloud) | Add prod SPA URL to Auth redirect allowlist. |

**Tasks**
- [ ] **[claude]** Add deploy config: `vercel.json` (SPA build), Render service def (start `node --env-file`→ use Render env vars instead), health-check route.
- [ ] **[you]** Create Vercel + Render + Inngest Cloud accounts/projects; paste env vars (rotated keys from S1).
- [ ] **[claude]** Set `ALLOWED_ORIGINS` = prod SPA domain (CORS already reads this env — no code change needed).
- [ ] **[you]** Register the app with Inngest Cloud (point at `https://<api>/api/inngest`).
- [ ] **[you]** Supabase → add prod SPA URL to Auth → URL config.
- [ ] **[claude+you]** Smoke-test: walk the full Sprint-0 loop once on the deployed URL from a different machine/browser.

**Definition of done:** full loop completes on the deployed URL, from a machine that isn't yours.

---

## Sprint 3 — Onboarding + critical-path polish (Day 4–5) ✨

**Goal:** a brand-new invited partner gets from invite → first valuable, certified output **without you on a call.**

**Tasks — invite-only onboarding (closed test)**
- [ ] **[claude]** Hide/disable the public sign-up link (invite-only); keep sign-in.
- [ ] **[you]** Create the partner accounts (Supabase invite or manual) + seed credits (from S1) + set brand name.
- [ ] **[claude]** First-run empty states: "No canon yet" → Discovery CTA (exists); "no briefs yet" → Create CTA; a 1-screen "here's how CaastorOS works" on first login.

**Tasks — make the hot paths forgiving**
- [ ] **[claude]** Error handling: scrape fails / Inngest delayed / model error → friendly message + retry, never a blank screen or raw 500.
- [ ] **[claude]** Discovery: clearer progress + a "taking longer than usual" state past ~60s (the 90s fallback exists).
- [ ] **[claude]** Verify the **Steward self-cert** flow end-to-end on prod (your Team queue → certify → client cert chip). Since self-cert, it only needs to work, not scale.
- [ ] **[claude]** Clear the P1 bugs from Sprint 0 + the known canvas height-clip.

**Definition of done:** a teammate who's never seen the app completes the loop solo from an invite link, on prod.

---

## Sprint 4 — Observability + soft invite (Day 6) 👀

**Goal:** when a partner hits a bug you *see* it; one real partner is already through the loop.

**Tasks**
- [ ] **[claude]** Error capture (Sentry free tier or a simple server error → log/webhook) so prod failures aren't invisible.
- [ ] **[claude]** Minimal funnel events: `signup`, `discovery_started`, `bio_certified`, `run_completed`, `craft_delivered` (so you can see where partners drop). Keep it lightweight.
- [ ] **[you]** Stand up a support channel (shared email / WhatsApp / Slack) + a one-pager "what to expect" for partners.
- [ ] **[you]** Invite **1 friendly partner (Vinilo)** → watch them go through it live → **[claude]** hotfix anything that breaks.

**Definition of done:** 1 external brand has produced *and received* a certified output on prod; issues logged with a way to see future ones.

---

## Sprint 5 — Launch to design partners (Day 7) 📣

**Goal:** the full 5–10 are in.

**Tasks**
- [ ] **[you]** Send invites in **2 waves** (e.g. 3 then the rest) so support load is absorbable.
- [ ] **[you+claude]** Daily watch: credit burn per workspace, error rate, completion funnel.
- [ ] **[claude]** Same-day hotfixes for anything blocking a partner.

**Definition of done:** design partners onboarded; a working feedback + hotfix loop running.

---

## Definition of "ready to ship" (the gate)

All must be true before Sprint 5 invites go out:
- [ ] Full loop verified on **prod** (not just local).
- [ ] A 0-balance run is **blocked cleanly** (cost guardrail proven).
- [ ] All chat-exposed keys **rotated**; email confirm **on**; `/security-review` no P0.
- [ ] A first-time user can complete the loop **solo from an invite**.
- [ ] Prod errors are **visible** to you.
- [ ] Each partner workspace has a **credit grant** that caps their spend.

## Risk register

| Risk | Likelihood | Mitigation |
|---|---|---|
| Sprint 0 uncovers a deep break in compile-bio / runs | Med | That's the *point* of S0 on Day 1 — find it while there's a week of runway, not on launch day. |
| Surprise API bill from a partner | Med→Low | Pre-run balance check + per-workspace cap + fixed grant (S1). Hard ceiling, not advisory. |
| Inngest Cloud registration friction | Med | Self-host the Inngest dev server on Render as fallback if Cloud onboarding stalls. |
| Steward (you) becomes the bottleneck | Med | Self-cert only needs ~minutes/BIO; 5–10 partners is manageable. Cert is a trust signal, not a hard gate (`requireCertified=false`), so a slow cert never blocks a partner's runs. |
| Scope creep into features | High | See "explicitly out of scope" below. |

## Explicitly OUT of scope for this week (defer)

- Open/public signup, Stripe billing, self-serve credit top-up.
- Motion & Sound department (the 5 deferred specialists).
- `craft_jobs` dedicated table (the JSONB-in-output approach works for the test).
- Mobile-optimized layouts.
- Multi-brand workspace switching polish (closed partners = 1 brand each).
- Anything in the canvas beyond fixing known P1 bugs (it's the moat — additive only, don't refactor under time pressure).

## Standing rules (do not violate — from CLAUDE.md)
Don't change flow/features without verifying first · focus only on the ask · cost-optimize APIs at scale · only show **credits** to users (never raw API cost) · the canvas is the MOAT (additive only) · call it **CaastorOS**.

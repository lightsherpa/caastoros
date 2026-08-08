# BIO Teardown v0 — Phase 0a (self-serve) · CAA-33

A thin, public entry flow on top of the existing Discovery→BIO engine. **No new
platform.** URL in → the same `compile-bio` synthesis → gated report → email-gate
PQL + funnel events → BIO download + pilot CTA.

## What it reuses (already shipped, verified live)
| Job | Module |
|---|---|
| Fetch public surface | `server/src/lib/firecrawl.js` (`scrape` / `mapAndScrape`) |
| URL → v0.1 BIO | `server/src/inngest/functions/compile-bio.js` (event `discovery/start`, now `mode:"teardown"`) |
| Persist brand + append-only BIO versions | `brands` + `bios` tables |
| 0–100 score | `server/src/lib/score-bio.js` (`scoreBio`, persisted on `bios.score`) |

## What 0a adds (small)
- `server/src/routes/teardown.js` — public route (no auth; service-role client).
- `server/src/lib/teardown-scorecard.js` — per-section breakdown + gaps, a **pure
  view** over `bios.payload` (no schema change; overall === `scoreBio`).
- `server/src/lib/teardown-events.js` — funnel event names + `computePql`.
- `server/src/lib/teardown-config.js` — **pluggable** offer/report copy (CMO-gated).
- `server/src/lib/teardown-report.js` — self-contained gated HTML report.
- `supabase/migrations/20260809120000_teardown_leads.sql` — `brands.source`,
  `teardown_leads`, `teardown_events` (additive; RLS service-role-only).

## Flow / endpoints
```
POST /api/teardown/start  {url}      → { leadId, brandId, status:"processing" }
GET  /api/teardown/:id               → { status, score, scorecard, claimed, offer, bio? }
GET  /api/teardown/:id/report        → gated HTML (auto-refresh while processing)
POST /api/teardown/:id/claim {email} → email gate → PQL + events → { pql, band }
GET  /api/teardown/:id/bio.json      → BIO download (claimed only)
POST /api/teardown/:id/event {name}  → client beacon (pilot CTA click)
```

## Funnel event contract (§3.1 — read by CAA-16)
Append-only `teardown_events(lead_id, brand_id, name, props, created_at)`. Names
mirror the `@caastor/analytics` taxonomy so CAA-16 forwards 1:1 to PostHog:

`teardown_started` → `teardown_bio_ready` → `teardown_report_viewed` →
`teardown_email_captured` (the gate) → `teardown_pql_created` →
`teardown_bio_downloaded` → `teardown_pilot_cta_clicked`

**PQL** = `round(0.6·engagement + 0.4·clarity)` where clarity = `bios.score`;
stored on `teardown_leads.pql_score` / `pql_band` (cold<40 / warm / hot≥70).

## Persistence contract (unclaimed → claimed)
A lead owns one `brands` row (`source="teardown"`) in a throwaway tier-00
workspace. The BIO is **tier-1 self-cert only** — `compile-bio` in teardown mode
**skips the Steward enqueue** so anonymous leads never spend human capacity.
"Claim" attaches that workspace/brand to the signing-up user; the **same brand's
`bios` version history continues** (v2, v3… on real briefs), and a Steward
onboarding cert fires then — not before.

## Measured (real runs, 2026-08-09)
| Brand | Score | Model $/run | Latency |
|---|---|---|---|
| oatly.com | 87 | $0.056 | 47s |
| allbirds.com | 82 | $0.052 | 40s |

~$0.05–0.07/run single-page (Gemini 2.5 Pro synth + Flash verify + ~1 Firecrawl
credit); well under the <90s UX target.

## Not in 0a (guardrails)
- **No auto-generated sample creatives** (Phase 0b — additive call to
  `models/router.js` + `compose-*-prompt.js`; no teardown rearchitecture). No
  auto-creative claims in 0a copy.
- No verification (CAA-7), no billing (CAA-8).

## To go live (gated on sign-off — not done here)
1. Apply the migration to Supabase.
2. Ellis: confirm events pull-vs-push + finalize pilot-offer copy (CMO/CEO-gated).
3. Brandolph: confirm teardown = tier-1 self-cert (no Steward burn).
4. Add rate-limiting / abuse guard on `POST /start` before paid traffic (0a has a
   10-min same-URL reuse guard only).

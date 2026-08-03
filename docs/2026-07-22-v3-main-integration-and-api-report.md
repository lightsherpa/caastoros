# CaastorOS V3 Main Integration and API Report

Date: 2026-07-22

## Executive status

The useful v3 interaction patterns are now implemented against the main platform's live contracts. The standalone `Caastor V3/` prototype remains a localStorage demo and is not used as a production data source.

Implemented in the main platform:

- Compact navigation rail with expansion, workspace switching, account menu, live credits, role-aware routes, and mobile bottom navigation.
- Editable decision brief before approval: title, objective, business tension, and execution direction.
- Separate crew approval before paid work starts: required/optional roles, exact credit total, live balance, and optional-role removal.
- Live contextual brief workspace with Overview, Canvas, Work, Review, Delivery, and Activity views.
- Review and delivery views use persisted run/output status only. No sample metrics or seeded output content are injected.
- Gemini current-generation routing in code and in the active Supabase specialist specs.

## V3 integration decisions

### Ported

1. **Progressive navigation**
   The rail is compact during normal work and auto-collapses on Canvas/workspace routes. It preserves the production workspace selector, roles, credits, notifications, and account state.

2. **Two explicit approvals**
   Brief approval and crew/cost approval are now separate. Editing the brief is free. The run begins only after the exact crew and credit amount are approved.

3. **Contextual brief workspace**
   Briefs now open into a persistent workspace instead of jumping directly into an unstructured canvas. Each tab derives from the Supabase brief/runs/outputs join.

4. **Provenance-first delivery**
   BIO certification, model route, specialist, output status, timestamps, and run counts remain visible where relevant.

### Deliberately not ported

- V3 localStorage seed data, fake activity, fake metrics, and sample clients.
- V3's duplicated specialist catalog. The main platform already has the 55-agent catalog and live specs.
- Mock review mutations. The current output API does not yet support an approval-status transition.

## API integration matrix

| Integration | Status | Main use | Verification on 2026-07-22 |
|---|---|---|---|
| Supabase | Live | Auth, RLS data, BIOs, briefs, runs, outputs, storage, realtime | Local URL/anon/service keys present. Live brief workspace uses the existing joined query. Eleven active Gemini specialist specs were updated in Supabase without reseeding unrelated payloads. |
| Anthropic | Live | Brandolph, Sharpener, direct Claude specialist routes | Local key present. Production `/healthz` reports `hasKey: true`. |
| OpenRouter | Live | Gemini and non-Claude text routing | Local key present. Direct streaming smoke tests passed for both new Gemini routes. |
| Gemini 3.6 Flash | Live through OpenRouter | Higher-quality synthesis, BIO compiler, audience/headline/insight routes | `google/gemini-3.6-flash` returned a successful streamed completion through the existing adapter. |
| Gemini 3.5 Flash-Lite | Live through OpenRouter | Low-cost QA, visual extraction, subject/product/SEO/trend routes | `google/gemini-3.5-flash-lite` returned a successful streamed completion through the existing adapter. |
| OpenAI GPT-5 | Live through OpenRouter | Conversion-copy specialist route | The normalized router smoke test returned visible text and usage at a reasoning-safe output budget. |
| fal.ai | Wired | Flux, Recraft, GPT Image 2 generation | Local key present. Image route unit tests pass; no paid image generation was triggered in this verification run. |
| Firecrawl | Wired | Full V2 Discovery website extraction | Local key present and `DISCOVERY_V2=1`. End-to-end production extraction was not rerun in this change set. |
| Inngest | Deployed endpoint | BIO compilation and notification email jobs | `https://app.getcaastor.co/api/inngest` is handled by the Inngest SDK. An unsigned GET returns 401, which confirms the handler is present but does not prove Cloud sync/signing configuration. Local production keys are intentionally absent. |
| Resend | Optional, not configured locally | Notification email | Code is wired; local key is absent. `render.yaml` declares a secret placeholder. |
| Stripe | Deferred/unconfigured | Hosted checkout and billing webhooks | Code exists, but local secret/webhook/price variables are absent and `render.yaml` does not declare them. Billing returns 503 until configured. |
| Render + DNS | Live | Single-origin SPA/API deployment | `https://app.getcaastor.co/healthz` returned HTTP 200 with the expected origin. DNS CNAME resolves to `caastoros-client-test.onrender.com`. |

## Gemini migration

The previous routes used Gemini 2.5 Pro and 2.5 Flash. They now map as follows:

| Previous route | New route | Purpose |
|---|---|---|
| `openrouter/google/gemini-2.5-pro` | `openrouter/google/gemini-3.6-flash` | Strong synthesis and reasoning work |
| `openrouter/google/gemini-2.5-flash` | `openrouter/google/gemini-3.5-flash-lite` | Cheap QA, extraction, and high-volume variants |

The existing OpenRouter adapter is compatible: it sends standard system/user messages and does not send the sampling parameters the new models reject. Official model and lifecycle references:

- https://ai.google.dev/gemini-api/docs/latest-model
- https://ai.google.dev/gemini-api/docs/models
- https://ai.google.dev/gemini-api/docs/deprecations

Observed behavior: Gemini 3.6 Flash used most of a 128-token smoke-test budget on reasoning before returning `CAAS`. Production routes use larger budgets, but completion-token use and empty-output rates should be monitored during the pilot.

## Remaining backend gaps

1. **Output approval mutation**
   Review is truthful but read-only. Add a server-side approval/rejection transition with role checks and an audit row before presenting approve/reject controls.

2. **Atomic assembly credit reservation**
   The UI records one crew approval, but the backend still charges each specialist run independently. A mid-assembly failure can leave a partially charged assembly. Add a reservation/idempotency endpoint for production billing rigor.

3. **Production environment inspection**
   The public service is healthy, but Render secret presence and Inngest Cloud function sync were not inspected from the provider workspace in this run.

4. **Bundle size**
   The production build succeeds, but the main JavaScript chunk is about 911 kB before gzip. Route-level code splitting is a post-MVP performance improvement.

## Verification completed

- `npm run test:units`: 103/103 passing.
- `npm run build`: passing.
- Direct OpenRouter stream: Gemini 3.5 Flash-Lite passed.
- Direct OpenRouter stream: Gemini 3.6 Flash passed.
- `npm run test:router`: Anthropic Haiku, Gemini 3.5 Flash-Lite, Gemini 3.6 Flash, and GPT-5 all returned visible output plus normalized usage.
- Supabase: 11 active Gemini specialist specs migrated in place.
- Production health: HTTP 200.
- Desktop shell: compact/expanded layout verified at 1280x720, no horizontal overflow.
- Mobile shell: verified at 390x844, no horizontal overflow or major control overlap.
- Browser console: no errors or warnings during the checked flows.

## Ship gate

Before deploying this branch:

1. Commit and push the scoped main-platform changes.
2. Deploy the Render service from `feature/image-quality-overhaul`.
3. Confirm Render has OpenRouter, Firecrawl, fal.ai, Supabase, and production Inngest keys.
4. Confirm Inngest Cloud shows `compile-bio` and `send-notification-email` after sync.
5. Run one signed-in pilot rehearsal through editable brief approval, crew approval, a Gemini specialist, Library persistence, and ledger debit.

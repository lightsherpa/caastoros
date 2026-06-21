# Plan-Upgrade (Billing) — Technical Requirements & Plan

> Goal: turn the stub "Upgrade" CTAs into a real paid tier change — Stripe subscription → webhook writes `workspaces.tier` → entitlements follow.
> Status: PLAN ONLY. No code changed. Synthesized from 6 research lanes (2026-06-21).
> Tiers: `00` The Creek 🏞️ (free, 1 brand) · `01` The Dam 🦫 (2) · `02` The River 🌊 (3) · `03` The Colony 🐜 (∞).

## ⚠️ The finding that reshapes this work

**Today, a tier change only affects the brand limit.** Audit of every tier-gated thing:

| Entitlement | Enforced from `workspaces.tier`? |
|---|---|
| Brand count limit (`plan-limits.js` + `POST /api/brands`) | ✅ **Yes — server-side, real** |
| Templates (`template_versions.tier_from`) | ❌ Display label only — no server gate |
| Departments / specialists (`CI_DEPTS.tierFrom`) | ❌ Display metadata only |
| Craft marketplace access | ⚠️ Client-side lock only (bypassable) |
| Monthly credit pool | ❌ Env-driven, **not** tier-linked |

So a Stripe webhook that flips `tier` will, today, change **only** how many brands a workspace may have — nothing else. **Decision needed:** are templates/departments/craft/credit-pools meant to be real paid entitlements? If yes, the billing work must include a shared server-side `entitlementsForTier(tier) → { brandLimit, minTemplateTier, craftEnabled, monthlyPool, allowedDepartments }` and route all gates through it. If no, document them as marketing-only so nobody assumes the paywall holds. **This is the single most important decision in the plan.**

## Architecture (provider unanimous: Stripe Checkout + Customer Portal)

```
SPA UpgradeView ──POST /api/billing/checkout {tier}──▶ Stripe-hosted Checkout (subscription mode)
                                                              │ pay
                  ◀──redirect #/upgrade?status=success───────┘
                                                              ▼
Stripe ──webhook──▶ POST /api/billing/webhook  (raw body, signature-verified, idempotent)
                       └─ THE ONLY WRITER of workspaces.tier  (price → tier map)
Manage/cancel/downgrade ──POST /api/billing/portal──▶ Stripe Customer Portal
```
- **Stripe-hosted Checkout** (PCI SAQ-A — card data never touches our servers) + **Customer Portal** for upgrade/downgrade/cancel/invoices (zero UI to build). One Stripe Customer per workspace; one active subscription. Keep each tier a **single recurring Price, one line item** (Portal can't self-serve multi-product subs).
- No custom card form, no Payment Links.

## Data model — additive only (one migration)

All new state lives on `workspaces` (one sub per workspace → no `subscriptions` table) + a tiny idempotency table:

```sql
-- 20260621xxxxxx_billing_subscription_state.sql
alter table workspaces
  add column stripe_subscription_id text,
  add column subscription_status    text check (subscription_status in
        ('active','past_due','canceled','trialing','incomplete')),
  add column current_period_end     timestamptz,
  add column price_id                text,
  add column cancel_at_period_end   boolean not null default false,
  add column billing_status         text not null default 'active';   -- dunning state machine

alter table brands add column locked_at timestamptz;   -- downgrade soft-lock (read-only, never deleted)

create table billing_events (                            -- webhook idempotency
  event_id text primary key, type text not null, processed_at timestamptz not null default now()
);
alter table billing_events enable row level security;    -- service-role only; default-deny others
```
- `workspaces.tier` + `stripe_customer_id` already exist and are **reused** — webhook writes `tier`, all existing readers keep working.
- **Price→tier mapping = env config** (≤6 price IDs, test/live differ), not a DB table:
  `PRICE_TO_TIER = { [env.STRIPE_PRICE_DAM_*]:"01", [env.STRIPE_PRICE_RIVER_*]:"02", [env.STRIPE_PRICE_COLONY_*]:"03" }`. The Creek (00) has no price.

## Server API (`server/src/routes/billing.js` + `server/src/lib/stripe.js`)

| Endpoint | Auth | Does |
|---|---|---|
| `POST /api/billing/checkout` `{tier[,cycle]}` | `requireAuth` | find/create Stripe Customer (store `stripe_customer_id`, `metadata.workspace_id`), create subscription Checkout Session for tier's price, return `{url}`. Reject tier `00`/unknown. |
| `POST /api/billing/portal` | `requireAuth` | return Billing Portal session `{url}` for the workspace's customer (manage/cancel/downgrade). |
| `POST /api/billing/webhook` | **signature only** | raw body → `stripe.webhooks.constructEvent` → idempotent dedupe → map subscription price→tier → write `workspaces.tier` + status columns. |

**Webhook critical details:** read raw body via `c.req.text()` (NEVER `c.req.json()` first — breaks signature). Hono has **no global body parser today** (only `logger()`+`cors()`), so it's safe — but any future body middleware must exclude this path. Idempotency via `billing_events` PK (`insert … on conflict do nothing`). Event→action:

| Event | Action |
|---|---|
| `checkout.session.completed` | resolve workspace (`client_reference_id`/customer) → set tier from sub price (fast-path) |
| `customer.subscription.created/updated` | active/trialing → tier from current price; canceled/unpaid → `00`; `cancel_at_period_end` → keep tier until period end |
| `customer.subscription.deleted` | tier → `00`; trigger over-limit soft-lock |
| `invoice.payment_failed` | set `billing_status='past_due'` — **do not** drop tier yet (dunning) |

Webhook is the **sole writer of tier**; client-sent tier only picks the checkout price, grants nothing.

## Tier transitions (the hard logic)

- **Upgrade** (widens access): webhook flips tier up; immediate; Stripe prorates. Safe — nothing existing breaks. (Optimistic UI ok; server `canAddBrand` still reads DB tier, so a lagging webhook just 402s the first over-old-limit add for a few seconds.)
- **Downgrade** (end-of-period): webhook flips tier down when the new period starts. **The hard problem:** a 3-brand workspace dropping to The Dam (2)/Creek (1) is over-limit. **Policy: soft-lock excess brands read-only** via `brands.locked_at` — user-chosen which stay active (default = least-recently-active), 14-day grace, **never deleted**. Locked = BIO/outputs viewable+exportable, but no new runs/briefs/canvas/craft. Re-upgrade clears the lock.
  - Enforcement points (new): `canAddBrand` counts only non-locked brands; `runs.js`/`briefs.js`/`craft.js` reject locked brands with `403 BRAND_LOCKED`. This is the load-bearing gate that actually stops spend.
- **Failed payment → dunning:** mirror Stripe status into `workspaces.billing_status`; **full access through the whole retry window** (~7–14 days); only on retry-exhaustion → tier `00` + the same soft-lock. **Never zero purchased top-up credits** (plan pool resets with tier; paid top-ups are retained). Let in-flight runs finish; block new.
- **Trial:** none in v1 — **The Creek is the perpetual free tier.** (Stripe `trial_period_days` is a trivial later add reusing the same events.)

## Frontend (`UpgradeView` in `portal-shell.jsx` + Settings billing tab)

- Replace the `setNote` stub: higher-tier "Upgrade" → `POST /api/billing/checkout` → `window.location = url`. Button matrix: current = "Your plan" (disabled); higher = "Upgrade"; lower = "Switch to this plan" → confirm → Billing Portal.
- **Return handling:** parse `#/upgrade?status=…` (note: `useRoute` doesn't split query strings — read `window.location.hash` directly). On `success`, webhook may lag → **finalize-poll** the tier (~2s ×5) showing "Finalizing your upgrade…", then confirm; clean the URL. On `cancel`, soft "No changes made."
- **Lift `useWorkspaceTier`** to expose `refetch` (the poll needs it; `WorkspaceSwitcher` also consumes the hook — update both).
- **Manage billing** link → `POST /api/billing/portal`. Wire the existing dead Settings "Change plan"/"Downgrade" buttons too.
- **Prices:** add `window.CI_TIER_PRICES` (new source of truth; the only existing anchor is the `€399` Settings mock) + a monthly/annual toggle (annual ⇒ checkout payload needs `{tier, cycle}`). Tier 00 = "Free", Tier 03 maybe "Contact sales".
- Full state matrix required: loading-session / error / already-on-tier / finalizing / success / cancelled / downgrade-confirm. Reuse existing classes (no new CSS). **Plan prices are fine to show** — the "credits only, never API cost" rule governs internal per-call economics, not subscription list prices.

## Security · Testing · Rollout

- **Security:** secrets server-only (`server/.env`, placeholders in `.env.example`, never `VITE_`); mandatory webhook signature verify; idempotency; webhook = sole tier writer; ownership always from `auth.workspaceId` (never request body); PCI SAQ-A via hosted Checkout; log `event.id`+`type` only. Consider role-gating billing to workspace owner/admin.
- **Testing (no real charges):** pure `node --test` for `priceToTier`, `subscriptionToTier`, the over-limit-downgrade rule, idempotency dedupe. Test-mode e2e with `stripe listen --forward-to localhost:8787/api/billing/webhook` + `stripe trigger`; assert tier flips + dedupe holds. Smoke `scripts/test-billing-webhook.mjs` (valid-sig → 200+flip; bad-sig → 400; replay → no-op). Add `test:billing` + extend `test:units`.
- **Rollout:** single `BILLING_ENABLED` flag gates **both** UI and endpoints (off → keep today's stub CTA). Idempotent `scripts/setup-stripe-products.mjs` seeds Products/Prices, prints price IDs for `.env`. `scripts/reconcile-stripe.mjs` corrects any tier drift. Staged: test mode → limited live (allowlist) → on. Rollback = flip flag (migration is additive, nothing destructive).

## Sequencing (each increment shippable behind `BILLING_ENABLED=0`)

1. **Migration** (additive: columns + `billing_events` + `brands.locked_at`)
2. **Catalog + pure mappers** (`stripe.js`, `setup-stripe-products.mjs`, `priceToTier`/`subscriptionToTier` + tests)
3. **Webhook skeleton** (raw body, verify, idempotent, event→tier) — verify via `stripe trigger`
4. **Checkout + portal endpoints** (auth, customer create/store) — e2e test-mode flip
5. **Frontend wiring** (CTA→checkout, return-poll, portal, price display)
6. **Downgrade enforcement** (`brands.locked_at` + `403 BRAND_LOCKED` in runs/briefs/craft; dunning state machine)
7. **Flip `BILLING_ENABLED`** through staged rollout

Front-loads the source-of-truth (webhook→tier) before any UI, so the frontend always wires to a verified backend.

## Top risks → mitigation
- Webhook missed/out-of-order → idempotent + timestamp-gated writes + a reconcile script.
- Double subscription → if workspace already has an active sub, route plan changes to the **Portal**, not new Checkout.
- Downgrade data exposure → soft-lock (not delete), enforced at every write path.
- Secret leak / test-live mixup → server-only secrets, per-mode keys self-describe, wrong-mode webhook fails signature (fails closed).

## Decisions (resolved 2026-06-21)

> **Stripe is DEFERRED — do not build the payment/checkout integration yet.** The spec above stands for when it's greenlit. Critical split: **entitlement enforcement** (what each tier unlocks) reads `workspaces.tier` and needs **no Stripe** — buildable independently; the **payment → tier-change** half is the parked Stripe work.

- **#1 Entitlements scope — PENDING.** Are templates / departments / craft / credit-pools real paid gates or marketing-only? Recommendation: make **credit pool + craft** real gates (the defensible value levers), leave templates/departments as labels for now. Reads `workspaces.tier` → no Stripe. Awaiting choice.
- **#2 Prices — keep as-is.** No pricing defined; `—`/mock stays. No price work now.
- **#3 Downgrade — soft-lock, 7-day grace** (was 14), least-recently-active default, read-only-but-exportable. Only fires once tier changes exist (Stripe or manual moves).
- **#4 The Colony (03) — "Talk to us".** CTA contacts sales; no self-serve checkout for this tier.
- **#5 Plan changes — owner/admin only.** (Role model is `client|team|admin`; no separate "owner" — maps to `admin` unless an owner concept is added.)
- **#6 Brand limits — `plan-limits.js` `{00:1,01:2,02:3,03:∞}` is canonical** (stale doc said `{00:1,01:1,02:1,03:5}`).

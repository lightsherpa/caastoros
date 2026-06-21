# CaastorOS — Engineering Refinement (P0 → P1.5 detail)

_Date: 2026-05-24 · Status: REFINEMENT, ready to execute._
_Companion docs (load order): `apis-and-agents-plan.md` (the kernel sequence), `2026-05-24-modes-templates-steward-plan.md` rev 2 (the modes/templates/steward additions), `ia-plan.md` (nav locked structure), `IMPLEMENTATION_LOG.md` (what's already shipped)._

This doc translates the rev-2 plan into engineering tickets. **P0 → P1.5 is detailed below at ticket level (file paths, schema deltas, API contracts, acceptance criteria).** P1.6 → P9 is forward-referenced — refine each as its predecessor lands. An engineer should be able to read §2 → §6 in order and start coding without further questions.

---

## 1. Repo state today (2026-05-24)

What exists:

```
/CaastorOS
├── docs/                          ← 7 plan docs (rev 2 of modes-templates landed today)
├── src/
│   ├── portal-shell.jsx           ← App shell + hash router + Sidebar/AppDock/TopBar
│   ├── portal-brandolph.jsx       ← HomeCreate (Auto state machine wired 2026-05-22)
│   ├── portal-discovery.jsx       ← Discovery (mock; needs three-bucket UI)
│   ├── portal-briefs.jsx          ← Briefs library + BriefBoard + composeSpecialistPrompt()
│   ├── portal-craft.jsx           ← "Human craft" page (label needs → "Humans")
│   ├── portal-team.jsx            ← Team portal pages (TeamQueue, TeamJob, etc.)
│   ├── portal-auth.jsx            ← Mock auth (window.CI_AUTH)
│   ├── portal-shared.jsx          ← BrandolphAvatar, Icon, BrandolphDot, etc.
│   ├── portal-data.js             ← All mocks: CI_AGENTS, CI_DEPT_SPECS, CI_BRAND, CI_TIERS, CI_BRAND_REFUSALS, etc.
│   └── portal-floater.jsx         ← Floating Brandolph mascot
├── server/
│   └── src/routes/brandolph.js    ← One route file; no framework wired
├── public/
│   └── intelligence/              ← Static assets (logos, profile photos)
├── package.json                   ← React 18 + Vite only. No Supabase, no Hono, no Inngest, no router lib.
└── vite.config.js
```

What does NOT exist yet:

- No Supabase project / DB / RLS / auth.
- No Hono edge API.
- No Inngest worker runtime.
- No Stripe.
- No real models — `window.CI_*` is all mocks.
- No router library — hand-rolled hash router in `portal-shell.jsx`.
- No build pipeline beyond `vite dev` / `vite build`.
- No tests.

**This is a greenfield backend.** Every API contract below is something to create, not modify.

---

## 2. Pre-P0 quick wins (ship this week — no backend required)

These four items land user-visible value (or unblock later phases) without touching the backend. Ship them as small PRs against the prototype.

### 2.1 · QW-001 · IA naming fix → `Specialists / Humans` structure

**File:** `src/portal-shell.jsx` (the existing `CLIENT_ROUTES` const)
**Companion:** `2026-05-24-modes-templates-steward-plan.md` §2 (locked structure)
**Estimate:** 30 min
**Tier of impact:** all clients

**What to change:**

Replace `CLIENT_ROUTES` (currently 8 items, 4 sections: Workspace / Brand / Capabilities / Account) with the rev-2 locked structure:

```js
const CLIENT_ROUTES = [
  { id:"home",        label:"Create",      icon:"sparkles", section:"Create / Briefs" },
  { id:"briefs",      label:"Briefs",      icon:"brief",    section:"Create / Briefs" },
  { id:"bio",         label:"BIO",         icon:"bio",      section:"BIO / Library" },
  { id:"library",     label:"Library",     icon:"files",    section:"BIO / Library" },
  { id:"specialists", label:"Specialists", icon:"team",     section:"Specialists / Humans" },
  { id:"craft",       label:"Humans",      icon:"craft",    section:"Specialists / Humans" },
  { id:"credits",     label:"Credits",     icon:"credit",   section:"Credits / Account" },
  { id:"settings",    label:"Account",     icon:"settings", section:"Credits / Account" },
];
```

Also update `TopBar.titles` (~line 246–265) so `craft` reads `"Humans"` and `bio` reads `"BIO"` (drop "Brand Intelligence" longform — section eyebrow now carries it).

Route ids stay `craft`, `bio`, `home`, `settings` to avoid breaking the route guard. The rename of `craft` → `humans` route id is deferred to a later cleanup PR per rev-2 plan §2.3.

**Acceptance:**
- Sidebar renders the four section eyebrows (`Create / Briefs`, `BIO / Library`, `Specialists / Humans`, `Credits / Account`) once each.
- All existing nav links still work (route ids unchanged).
- TopBar titles match the new labels.
- Grep `Human craft` and `human-craft` across `src/` → zero matches in client-facing strings.
- Append IMPLEMENTATION_LOG entry.

---

### 2.2 · QW-002 · `ShellMode` primitive (workspace vs default)

**Files:** `src/portal-shell.jsx` (new `useShellMode` hook, applied to `Sidebar` + `TopBar`)
**Companion:** rev-2 plan §7
**Estimate:** 1–2 days
**Tier of impact:** unblocks Manual mode at P5 + brief-detail focus mode

**What to build:**

A single `ShellMode = "default" | "workspace"` state, computed from the current route. Routes that set `workspace` mode:

```js
const WORKSPACE_ROUTES = new Set(["brief-detail", "canvas", "board"]);
const shellMode = WORKSPACE_ROUTES.has(route.id) ? "workspace" : "default";
```

When `shellMode === "workspace"`:
- `AppDock` collapses to icons-only with `:hover` reveal of labels.
- `TopBar` breadcrumb strip shrinks to ~24px height; title font-size drops a step.
- `<main>` width expands to fill (currently sidebar = 240px fixed; in workspace mode, sidebar = 56px).

When `shellMode === "default"`:
- Current behavior unchanged.

Use CSS custom properties driven from a `data-shell-mode` attribute on `<html>` (mirrors the existing `data-theme` / `data-palette` pattern in `useDesignSettings`).

**Acceptance:**
- Navigating to a brief-detail (`#/brief-detail/some-id`) collapses the dock and shrinks the topbar.
- Hovering the collapsed dock reveals labels with a 100ms transition.
- Navigating away (back to `home`) restores default mode.
- No layout shift when toggling.
- CSS only — no JS layout calculations.

---

### 2.3 · QW-003 · Three-bucket Discovery intake (UI mock)

**File:** `src/portal-discovery.jsx` (extend the existing Discovery component)
**Companion:** rev-2 plan §5.3
**Estimate:** 1 day
**Tier of impact:** unblocks Steward review UX at P1.5; client-visible

**What to build:**

Replace the current single "Upload sources" drop zone with three labelled drop zones:

```
┌─ Brand foundations ─────────────────────────────┐
│  Brand book, decks, manifestos, "about us" docs │
│  [drop or click to upload]                      │
└─────────────────────────────────────────────────┘

┌─ Visual references ─────────────────────────────┐
│  Moodboards, examples of work you admire        │
│  [drop or click to upload]                      │
└─────────────────────────────────────────────────┘

┌─ Voice references ──────────────────────────────┐
│  Emails, posts, talks where you sound like you  │
│  [drop or click to upload]                      │
└─────────────────────────────────────────────────┘
```

Local state: `uploadsByBucket: { foundations: File[], visual: File[], voice: File[] }`. Mock the upload (no backend yet) — just show file chips with bucket tag. The `bucket` field is the contract that P1 backend will consume.

**Acceptance:**
- Three visually distinct drop zones with the rev-2 labels.
- Drag-drop and click-to-upload both work.
- Each uploaded file shows its bucket tag.
- A "Continue" button at the bottom logs `{ foundations: [...], visual: [...], voice: [...] }` to the console (placeholder for the P1 API call).
- Mobile responsive: stacks vertically below 720px.

---

### 2.4 · QW-004 · OutputCard footer split (mock-side)

**File:** `src/portal-shared.jsx` (find the `OutputCard` component) or wherever the footer renders
**Companion:** rev-2 plan §5.5 + §9
**Estimate:** 0.5 day
**Tier of impact:** moat-defining trust signal

**What to build:**

Two render functions:

```jsx
function OutputFooterClient({ specialist, bio, steward, date }) {
  return (
    <div className="output-footer output-footer--client">
      Composed by {specialist.name} · BIO v{bio.version} · certified by {steward.firstName} · {date}
    </div>
  );
}

function OutputFooterDebug({ specialist, bio, steward, date, model, runId }) {
  return (
    <div className="output-footer output-footer--debug">
      Composed by {specialist.name} · routed via {model.label} · BIO v{bio.version}
      · certified by {steward.firstName} · {date} · run {runId.slice(0, 7)}
    </div>
  );
}
```

Choose render by `window.__CI_PORTAL`:
- `"client"` → `OutputFooterClient`
- `"team"` → `OutputFooterDebug`
- On client portal, hover any output card → reveal `OutputFooterDebug` in a tooltip (no click required).

Data still mocked from `window.CI_BRAND` (add `CI_BRAND.steward = { firstName: "Marina" }` to `portal-data.js`).

**Acceptance:**
- Client portal output cards show: `Composed by Conversion Copy · BIO v7 · certified by Marina · 14 May`. No model name.
- Team portal output cards show the debug variant by default.
- Hover on client card → debug variant in tooltip.
- Visual regression check: no layout shift between the two renders.

---

## 3. P0 — Backend skeleton + auth + schema bootstrap (1 week)

The first phase that touches real infrastructure. Lock the stack decisions from `apis-and-agents-plan.md §9` first; they are not re-litigated here.

**Locked stack (matches §9 recommendations):**

- DB / Auth / Storage: **Supabase**
- Edge API: **Hono on Cloudflare Workers** (deploy via Wrangler)
- Async jobs: **Inngest**
- Type system: **TypeScript** for the new server (the SPA stays JSX for now; types via JSDoc + `tsc --noEmit` checking)
- Migrations: **Supabase CLI** (`supabase/migrations/*.sql`)
- Local dev: **Supabase CLI** (`supabase start` → Postgres + Auth on Docker)

### 3.1 · P0-001 · Project bootstrap

**New files / dirs:**
```
/server                       ← rename existing 'server/' or merge into new structure
  /api                        ← Hono routes
    health.ts
    auth.ts
    runs.ts                   ← stub
  /db
    client.ts                 ← Supabase service-role client
  /lib
    types.ts                  ← Database = ReturnType<typeof createClient>['from']
  index.ts                    ← Hono app
  wrangler.toml               ← Cloudflare deploy config
  package.json                ← hono, @supabase/supabase-js, zod
  tsconfig.json
/supabase                     ← Supabase CLI scaffold
  /migrations                 ← 0001_init.sql goes here in P0-003
  config.toml
.env.local                    ← .env.local.example committed; .env.local gitignored
```

**Tasks:**
1. `pnpm dlx supabase init` → creates `supabase/`.
2. `pnpm dlx supabase start` → local Postgres on `:54322`, Auth on `:54321`.
3. `cd server && pnpm init` + install `hono`, `@supabase/supabase-js`, `zod`, `@cloudflare/workers-types`.
4. `wrangler init` (interactive: pick Worker, TypeScript yes).
5. Add a `GET /health` route returning `{ ok: true, version: <git_sha> }`.
6. Add a `pnpm dev` script at root that runs `vite` + `supabase start` + `wrangler dev` concurrently (use `concurrently` package).

**Acceptance:**
- `curl http://localhost:8787/health` returns `{ ok: true, version: "..." }`.
- `supabase status` shows Postgres + Auth running.
- `pnpm dev` from root brings up SPA (`:5173`), Worker API (`:8787`), and Supabase locally.

---

### 3.2 · P0-002 · Supabase project provisioned (staging)

**Tasks:**
1. Create Supabase project `caastor-staging` (region: `eu-west-2` for proximity to La Mesa team).
2. Capture `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` in `.env.local.example` (placeholders only).
3. Add `SUPABASE_*` vars to Cloudflare Worker secrets via `wrangler secret put`.
4. Configure Auth → magic-link only (email provider on; OAuth off for V1).
5. Email branding: pull logo from `public/intelligence/assets/logo-full-yellow.png`; subject = `Sign in to CaastorOS`.

**Acceptance:**
- Project exists; team members invited as `owner`.
- `wrangler secret list` shows three Supabase keys.
- Magic-link email lands in inbox when sent via Supabase dashboard.

**Not yet exposed to users** — this is infrastructure ready for P0-005.

---

### 3.3 · P0-003 · Schema bootstrap migration (`0001_init.sql`)

**File:** `supabase/migrations/0001_init.sql` (new)
**Depends on:** P0-001, P0-002
**Estimate:** 1.5 days
**Companion:** `apis-and-agents-plan.md §5` (core schema) + `modes-templates-steward-plan.md §10` rev-2 (additions)

The initial migration bundles both the core kernel schema and the rev-2 additions so that nothing has to be re-migrated later. Splitting them into 0001/0002 risks shipping an early version of the system without the moat-defining fields (`bios.certified_by`, etc.).

**Schema (concise — full SQL goes in the migration file):**

```sql
-- Tenancy
create table workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  tier text not null default '00' check (tier in ('00','01','02','03')),
  stripe_customer_id text,
  created_at timestamptz default now()
);
create table users (
  id uuid primary key references auth.users(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  email text not null,
  role text not null default 'client' check (role in ('client','team','admin')),
  created_at timestamptz default now()
);

-- Team
create table team_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  name text not null,
  first_name text not null,
  avatar_url text,
  roles text[] not null default '{}',         -- subset of ('craft','steward','ops','lead_steward')
  hourly_rate_cents int,
  active boolean default true,
  created_at timestamptz default now()
);

-- Industries (CMS-style, NOT enum — rev-2 §4.4)
create table industries (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  label_en text not null,
  label_es text,
  label_it text,
  display_order int default 0,
  active boolean default true,
  archived_at timestamptz,
  created_at timestamptz default now()
);

-- Brands (with rev-2 industry attribution)
create table brands (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  url text,
  industry text references industries(slug),
  industry_confidence float check (industry_confidence between 0 and 1),
  industry_source text check (industry_source in ('inferred','user_confirmed','user_set')),
  refusals text[] default '{}',
  created_at timestamptz default now()
);

-- BIO (append-only versioned, with rev-2 certification fields)
create table bios (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  version int not null,
  payload jsonb not null,
  score int,
  certified boolean default false,
  certified_by uuid references team_members(id),
  certified_at timestamptz,
  steward_notes text,
  cert_kind text check (cert_kind in ('onboarding','drift_check','re_extract')),
  created_by uuid references users(id),
  created_at timestamptz default now(),
  unique (brand_id, version)
);

-- BIO sources (with rev-2 three-bucket field)
create table bio_sources (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  kind text not null,
  bucket text check (bucket in ('foundations','visual','voice')),
  src text not null,
  signals jsonb,
  raw_ref text,
  created_at timestamptz default now()
);

-- Briefs (with rev-2 mode + template pin)
create table briefs (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  title text,
  type text,
  payload jsonb,
  sharpened_payload jsonb,
  mode text default 'auto' check (mode in ('auto','manual','template')),
  template_version_id uuid,                    -- FK added after templates table exists
  assembly_override jsonb,
  status text default 'draft',
  created_at timestamptz default now()
);
create table clarifications (
  id uuid primary key default gen_random_uuid(),
  brief_id uuid not null references briefs(id) on delete cascade,
  q text, a text, why text,
  created_at timestamptz default now()
);

-- Specs (kernel; templates and runs both reference)
create table specs (
  id uuid primary key default gen_random_uuid(),
  specialist_id text not null,                  -- 'a01'..'a33'
  version int not null,
  payload jsonb not null,                       -- role, objective, method, outputContract, refusals, voice, tools, modelRouting, bioSlices
  active boolean default false,
  created_at timestamptz default now(),
  unique (specialist_id, version)
);
create unique index one_active_spec_per_specialist
  on specs (specialist_id) where active = true;

-- Templates (rev-2 §4)
create table templates (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  tagline text,
  archived_at timestamptz,
  created_at timestamptz default now()
);
create table template_versions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references templates(id) on delete cascade,
  version int not null,
  outcome text,
  brief_skeleton jsonb,
  assembly jsonb,                               -- ['a02','a03','a20',...]
  expected_output_kinds text[],
  qa_gates jsonb default '{"voice": true, "brand": true}'::jsonb,
  estimate_credits int,
  industries text[],                            -- ['hospitality_fnb', ...] FK by slug
  objectives text[],
  featured boolean default false,
  featured_priority int,
  tier_from text not null check (tier_from in ('00','01','02','03')),
  status text default 'draft' check (status in ('draft','live','archived')),
  active boolean default false,
  last_used_at timestamptz,
  created_by uuid references team_members(id),
  created_at timestamptz default now(),
  unique (template_id, version)
);
create unique index one_active_version_per_template
  on template_versions (template_id) where active = true;
alter table briefs add constraint briefs_template_version_fk
  foreign key (template_version_id) references template_versions(id);

-- Runs (the kernel — every specialist invocation)
create table runs (
  id uuid primary key default gen_random_uuid(),
  brief_id uuid not null references briefs(id) on delete cascade,
  specialist_id text not null,
  spec_version int not null,
  bio_version int not null,
  model_used text,
  status text not null default 'queued' check (status in ('queued','running','completed','failed')),
  prompt_tokens int, completion_tokens int, cached_tokens int,
  cost_usd numeric(10,4),
  latency_ms int,
  started_at timestamptz, ended_at timestamptz,
  created_at timestamptz default now()
);

-- Outputs
create table outputs (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references runs(id) on delete cascade,
  brief_id uuid not null references briefs(id) on delete cascade,
  kind text not null,
  body jsonb,
  asset_url text,
  status text default 'pending' check (status in ('pending','approved','flagged','rejected')),
  rationale text,
  created_at timestamptz default now()
);
create table qa_results (
  id uuid primary key default gen_random_uuid(),
  output_id uuid not null references outputs(id) on delete cascade,
  refusal_id text,
  passed boolean,
  evidence text,
  created_at timestamptz default now()
);

-- Ledger (event-sourced credits)
create table ledger (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  run_id uuid references runs(id),
  credits int not null,                         -- positive = debit; negative = credit
  kind text not null,                           -- 'run','steward_cert','steward_drift','re_extract','topup','monthly_pool'
  balance_after int,
  created_at timestamptz default now()
);

-- Steward jobs (rev-2 §5.1, §5.4, §10)
create table steward_jobs (
  id uuid primary key default gen_random_uuid(),
  bio_id uuid not null references bios(id),
  brand_id uuid not null references brands(id),
  kind text not null check (kind in ('onboarding','drift_check','re_extract')),
  status text not null default 'queued' check (status in ('queued','in_review','completed','cancelled')),
  assigned_to uuid references team_members(id),
  outputs_reviewed_count int,
  lead_reviewed_by uuid references team_members(id),
  lead_reviewed_at timestamptz,
  override_reason text,
  credits_charged int default 0,
  queued_at timestamptz default now(),
  completed_at timestamptz
);

-- Uploads
create table uploads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references users(id),
  brand_id uuid references brands(id),
  url text not null,
  mime text,
  bucket_hint text check (bucket_hint in ('foundations','visual','voice')),  -- carries the rev-2 §5.3 bucket from the upload UI
  created_at timestamptz default now()
);

-- Public views for the `?ask=` allowlist (rev-2 §8.5) — created here as placeholders;
-- populated when the docs site is built (P8)
create view public_specs as
  select specialist_id, payload->>'name' as name, payload->>'role_label' as role_label,
         payload->>'department' as department, payload->>'public_description' as public_description,
         version
  from specs where active = true;
create view public_template_versions as
  select tv.id, t.slug, t.name, tv.outcome, tv.assembly,
         tv.expected_output_kinds, tv.estimate_credits, tv.tier_from, tv.industries
  from template_versions tv
  join templates t on t.id = tv.template_id
  where tv.active = true and tv.status = 'live';
create view public_industries as
  select slug, label_en, label_es, label_it, display_order
  from industries where active = true;
```

**RLS policies (every table; minimum viable):**

```sql
-- Default deny on every table
alter table workspaces enable row level security;
alter table brands enable row level security;
alter table bios enable row level security;
alter table briefs enable row level security;
alter table runs enable row level security;
alter table outputs enable row level security;
alter table ledger enable row level security;
alter table uploads enable row level security;
alter table steward_jobs enable row level security;
-- (industries, templates, template_versions, specs, team_members are admin/team-curated; policies in P0-006)

-- Workspace boundary: a row is readable iff caller's user.workspace_id matches
create policy ws_isolation_brands on brands for all to authenticated
  using (workspace_id = (select workspace_id from users where id = auth.uid()));
-- (similar policies for every workspace-scoped table — generated by a helper)

-- Steward jobs: readable by team members with 'steward' or 'lead_steward' role
create policy steward_role on steward_jobs for all to authenticated
  using (
    exists (
      select 1 from team_members tm
      where tm.user_id = auth.uid()
        and ('steward' = any(tm.roles) or 'lead_steward' = any(tm.roles))
    )
  );
```

**Seed (separate file: `supabase/seed.sql`):**

```sql
-- 8 V1 industries (rev-2 §4.4)
insert into industries (slug, label_en, label_es, label_it, display_order) values
  ('ecommerce_dtc',         'E-commerce / DTC',          'E-commerce / DTC',          'E-commerce / DTC',          1),
  ('saas_software',         'SaaS / Software',           'SaaS / Software',           'SaaS / Software',           2),
  ('hospitality_fnb',       'Hospitality / F&B',         'Hostelería / F&B',          'Ospitalità / F&B',          3),
  ('creative_agency',       'Creative / Agency',         'Creativo / Agencia',        'Creativo / Agenzia',        4),
  ('professional_services', 'B2B Professional Services', 'Servicios profesionales',   'Servizi professionali',     5),
  ('consumer_brand',        'Consumer Brand',            'Marca de consumo',          'Marca di consumo',          6),
  ('education',             'Education',                 'Educación',                 'Istruzione',                7),
  ('health_wellness',       'Health & Wellness',         'Salud y bienestar',         'Salute e benessere',        8);

-- Templates seeded as draft only — flip to 'live' in P4–P6 per rev-2 §12 sequencing
-- (Insert the 5 V1 core from rev-2 §4.2 here, all status='draft', active=false)
```

**Acceptance:**
- `supabase db reset` runs cleanly (no errors).
- `supabase gen types typescript --local > server/src/lib/database.types.ts` produces a usable types file.
- RLS test (manual): two workspaces created, user A cannot select brand of workspace B.
- All 8 industries present after seed.
- Foreign keys validate: insert brief with bogus `template_version_id` → error.

---

### 3.4 · P0-004 · Auth wiring (frontend ↔ Supabase magic-link)

**Files:**
- `src/portal-auth.jsx` (replace `window.CI_AUTH` mock with Supabase client)
- `src/lib/supabase-browser.js` (NEW — anon-key client)
- `server/api/auth.ts` (server-side session validation helper)

**Estimate:** 1 day

**What to build:**

1. `src/lib/supabase-browser.js`: `createClient(SUPABASE_URL, SUPABASE_ANON_KEY)` with `persistSession: true`.
2. `Login` component (already exists in `portal-auth.jsx`): replace mock with `supabase.auth.signInWithOtp({ email })`.
3. `useSession` hook: subscribe to `supabase.auth.onAuthStateChange`. Replace `window.CI_AUTH.session` reads.
4. On first sign-in, create a `users` row + a default `workspaces` row + a default `brands` row (the user's first brand). Implement as a Postgres trigger on `auth.users` insert.
5. `server/api/auth.ts`: middleware that reads the `Authorization: Bearer <jwt>` header, validates via Supabase, returns `{ userId, workspaceId, role }` for downstream handlers.

**Acceptance:**
- Sign in via magic link → land on `#/home` with real session.
- Refresh page → still signed in.
- `Sign out` button works.
- New user account auto-creates workspace + first brand (visible in Supabase dashboard).
- Worker API endpoint `GET /api/me` returns `{ userId, workspaceId, role }` for an authenticated request.

---

### 3.5 · P0-005 · First streaming endpoint (Ask Brandolph)

**Files:**
- `server/api/brandolph-ask.ts` (NEW)
- `server/lib/anthropic.ts` (NEW — vendor interface for Anthropic)
- `src/portal-brandolph.jsx` (wire existing "Ask Brandolph" node to the live endpoint)

**Estimate:** 1 day
**Companion:** `apis-and-agents-plan.md §6 P0` ("Done when: a real Claude reply streams into the existing Brandolph node")

**What to build:**

```
POST /api/brandolph/ask
  body: { brandId, briefId?, question }
  auth: required (P0-004 middleware)
  response: SSE stream of { token: string } events
```

Internally: validate workspace ownership of `brandId`; load BIO (latest version, **read uncertified for now — certification gate lands in P1.5**); compose a minimal prompt:

```
You are Brandolph, an L1 brand operator. The brand's BIO follows.
[BIO PAYLOAD]
Question: [question]
Answer concisely.
```

Stream `Sonnet 4.6` reply tokens to the client. Persist a `runs` row (no spec_version yet — Brandolph isn't a specialist; mark `specialist_id = 'brandolph_l1'`, `spec_version = 0`).

**Acceptance:**
- Typing in the Ask Brandolph input + Enter → real tokens stream in.
- Refusal path: `brandId` not owned by caller → 403.
- A `runs` row exists after the answer completes, with token counts populated.
- Latency to first token < 2s on home wifi.

---

### 3.6 · P0-006 · Specs + team_members + industries admin (minimal CRUD)

**Files:**
- `server/api/admin/specs.ts`, `server/api/admin/industries.ts`, `server/api/admin/team-members.ts`
- No UI in V1 — operate via Supabase Studio + a CLI script for spec import.

**Estimate:** 0.5 day

**What to build:**

A `scripts/seed-specs.ts` Node script that reads `src/portal-data.js` `CI_AGENTS` + `CI_DEPT_SPECS` and writes them to `specs` (one row per `a01..a33` with `active=true`, `version=1`). This is the bridge from mock to DB.

**Acceptance:**
- `pnpm seed-specs` populates 33 spec rows.
- `select count(*) from specs where active` returns 33.
- Each spec has a non-null `payload->>'modelRouting'`.

---

### 3.7 · P0-007 · CI / deploy basics

- GitHub Actions: on push, run `tsc --noEmit` + `vite build` + `wrangler deploy --dry-run`.
- Cloudflare Worker deploy: manual via `wrangler deploy` (automate after P3 once we have actual users).
- Supabase staging migrations: applied via `supabase db push` from `main` branch on green CI.

**Acceptance:** PR shows green checkmark; merging `main` does NOT auto-deploy yet (manual gate until P3).

---

### P0 acceptance summary

P0 is done when **all** of the following hold:

- [ ] Magic-link auth works end-to-end (P0-004).
- [ ] A real Claude reply streams into the Ask Brandolph node (P0-005).
- [ ] DB has 8 industries + 33 spec rows + at least 1 real workspace/brand pair (P0-003 + P0-006).
- [ ] RLS cross-workspace test passes (P0-003).
- [ ] `pnpm dev` brings up the full local stack.
- [ ] CI is green on `main`.

**P0 does NOT include** any specialist runs (P3), Discovery → BIO (P1), or Steward operation (P1.5). It is the spine.

---

## 4. P1 — Discovery → BIO live (2 weeks)

**Companion:** `apis-and-agents-plan.md §6 P1` + `modes-templates-steward-plan.md §5.3` (three-bucket intake) + §12 row P1.

The P1 work in the existing kernel plan stands; the rev-2 additions slot in cleanly.

### Tickets

- **P1-001 · `/api/discovery/start` endpoint + Inngest job.** Inputs: `{ url, brandId }`. Job stages: (1) Firecrawl scrape → `bio_sources` rows with `bucket = null` (URL-derived sources are bucketless), (2) screenshot + Claude vision → palette/type, (3) a30 BIO Compiler (Opus) synthesises BIO → writes `bios` row with `version = 1`, `certified = false`.
- **P1-002 · SSE stream `/api/discovery/:id/stream`** — `{ stage, signal, partialBio }` events for the existing Discovery UI to consume.
- **P1-003 · Three-bucket upload endpoint** (the backend half of QW-003). `POST /api/bios/:brandId/sources` with `multipart` and a required `bucket` form field. Validates against the rev-2 enum. Writes `bio_sources` with `bucket` populated.
- **P1-004 · BIO editor write path.** `PATCH /api/bios/:brandId` creates a new `bios` row (version++), copies payload, applies patch, sets `certified = false`. **The patch invalidates certification** — see P1.5-005 for re-cert flow.
- **P1-005 · `bioSlices` prompt assembler refactor.** Port `composeSpecialistPrompt()` from `src/portal-briefs.jsx:426` into `server/lib/prompt-composer.ts`. Read the spec's `bioSlices` array and project only those fields from the BIO. This is the field that makes prompt caching actually save 60–80% — without it, full BIO injection wastes tokens.

### Acceptance

- A real URL (e.g. vinilo.es) typed into the Discovery UI yields a BIO that persists. The BIO editor's saves create new `bios` rows.
- Upload a PDF into the "Brand foundations" zone → `bio_sources` row has `bucket='foundations'`.
- The discovered BIO has `certified = false` and no `certified_by` — it is **NOT yet usable for brief runs** (gate lands in P1.5).

---

## 5. P1.5 — Steward operation (NEW from rev 2 · CRITICAL PATH)

**Companion:** `modes-templates-steward-plan.md §5` (entire) + §12 row P1.5 + §16 rows 1, 7–12, 15, 20.

This is the rev-2 phase that **gates P3**. Until P1.5 ships, no production specialist run can fire (because every spec reads from a certified BIO per §17 moat pillar #1). Resource it accordingly — see rev-2 §12 critical-path correction.

### 5.1 · P1.5-001 · Steward job queue UI (team portal)

**Files:**
- `src/portal-team.jsx` — extend `TeamQueue` to render `steward_jobs` rows
- `src/portal-team.jsx` — new `StewardJobReview` component (full-screen review of a candidate BIO)
- `server/api/steward/jobs.ts` — `GET /api/steward/jobs` (RLS-gated to `steward`/`lead_steward` roles)
- `server/api/steward/jobs.ts` — `PATCH /api/steward/jobs/:id` (Steward submits cert)

**Estimate:** 3 days

**What to build:**

Team portal `Job queue` (`#/team`) gains a Steward section. Each `steward_jobs` row renders as a card:

```
┌─ Vinilo · onboarding certification ────────────┐
│  Queued 2h ago · 3 sources · est. 20 min       │
│  [Open review →]                                │
└────────────────────────────────────────────────┘
```

The `StewardJobReview` page renders three panes:

- **Left:** the candidate BIO (read-only diff view if there's a prior cert; full text otherwise).
- **Center:** the source intake grouped by bucket (foundations / visual / voice).
- **Right:** the Steward's action form — accept, edit (in-place BIO patch), or reject with notes.

On accept: `PATCH /api/steward/jobs/:id` with `{ status: 'completed', bio_patch?, notes? }`. Server:
1. If `bio_patch` present, creates a NEW `bios` row with the patched payload.
2. Sets `certified = true`, `certified_by = me`, `certified_at = now()`, `cert_kind = 'onboarding'` on the new (or candidate) row.
3. Marks the `steward_jobs` row `completed`.
4. Writes a `ledger` row charging the workspace per the rev-2 §5.2 rules (Tier 02+ onboarding = 0 cr absorbed; tracked separately as `kind='steward_cert'` for the §5.2 tripwire monitoring).
5. Triggers the in-app client notification (P1.5-006).

### 5.2 · P1.5-002 · Steward assignment + rotation rule

**File:** `server/lib/steward-assigner.ts` (NEW)

The assignment function that runs on every new `steward_jobs.queued` row:

```ts
async function assignSteward(jobId: string) {
  const job = await loadJob(jobId);
  // Eligibility: 'steward' role AND not actively crafting on this brand
  const eligible = await db.from('team_members')
    .select('id')
    .contains('roles', ['steward'])
    .eq('active', true);
  // Exclude any team member appearing on a non-completed runs.* for this brand
  const excluded = await db.rpc('team_members_crafting_brand', { brand_id: job.brand_id });
  const candidates = eligible.filter(tm => !excluded.includes(tm.id));
  if (candidates.length === 0) return assignLeadStewardOverride(jobId, 'rotation_exhausted');
  // Round-robin by least-recent assignment
  const chosen = await pickLeastRecent(candidates);
  await db.from('steward_jobs').update({ assigned_to: chosen.id }).eq('id', jobId);
}
```

The `assignLeadStewardOverride` path implements rev-2 §5.1 capacity fallback: log `override_reason`, fall back to a Lead Steward, auto-extend SLA via a scheduled job.

**Acceptance:**
- Insert a `steward_jobs` row → trigger runs → `assigned_to` populated within seconds.
- Set rotation-eligible Stewards to 0 → falls back to Lead with `override_reason = 'rotation_exhausted'`.

### 5.3 · P1.5-003 · BIO certification gate (the moat enforcement)

**File:** `server/lib/load-bio-for-run.ts` (NEW; called by every specialist run before composing the prompt)

```ts
export async function loadBioForRun(brandId: string): Promise<Bio> {
  const { data: bio } = await supabase
    .from('bios')
    .select('*')
    .eq('brand_id', brandId)
    .eq('certified', true)
    .order('version', { ascending: false })
    .limit(1)
    .single();
  if (!bio) throw new BioNotCertifiedError(brandId);
  return bio;
}
```

Calling code (the Specialist Runtime in P3) MUST use this loader. Bypassing it is a code-review failure.

**Acceptance:**
- A specialist run against a brand with no certified BIO returns a structured error: `{ code: 'BIO_NOT_CERTIFIED', brandId }`.
- The frontend renders this error as: "Your BIO is awaiting certification by your Brand Steward — Marina will review within 24h."

### 5.4 · P1.5-004 · Steward calibration second-reviewer flow

**Files:** extend P1.5-001 UI; `server/api/steward/lead-review.ts` (NEW)

For the first 30 days post-launch (rev-2 §5.1 calibration window), every Steward submission goes into a `pending_lead_review` substate instead of `completed`. The Lead Steward sees a "Calibration reviews" tab on the team portal with the pending jobs. On Lead approval: write `lead_reviewed_by`, `lead_reviewed_at`, flip status to `completed`, fire the client notification.

A feature flag `CALIBRATION_REQUIRED` (env var) controls whether this gate is on. Default `true` until lead manually flips it off.

**Acceptance:**
- With `CALIBRATION_REQUIRED=true`, Steward submission lands in `pending_lead_review`, not `completed`.
- Lead approval populates `lead_reviewed_by`, `lead_reviewed_at`, marks `completed`.
- Setting `CALIBRATION_REQUIRED=false` reverts to direct-completion flow.

### 5.5 · P1.5-005 · BIO edit re-certification trigger

When the BIO editor patches a certified BIO (P1-004), the new `bios` row lands with `certified = false`. P1.5-005 enqueues a `steward_jobs` row with `kind = 'drift_check'` (a small re-cert, not a full onboarding) to validate the user-applied edits. Tier 02 users see this counted against their quarterly cap; Tier 03 unlimited.

The previously certified version remains the **active BIO for specialist runs** until the new candidate is re-certified — `loadBioForRun()` selects the highest-version `certified = true` row, not the absolute highest version.

**Acceptance:**
- Editing a certified BIO creates a candidate with `certified=false` AND enqueues a `steward_jobs` row.
- Specialist runs continue to use the previously certified version.
- Once re-cert completes, new version becomes active.

### 5.6 · P1.5-006 · Client-facing notification + UI surface

**File:** `src/portal-discovery.jsx` (end of Discovery flow), `src/portal-shared.jsx` (BIO viewer header)

After Discovery completes and the BIO synthesises:

```
Your Brand Steward, Marina, will certify your BIO within 24h.
[avatar] Marina · senior designer, La Mesa
```

In the BIO viewer (`#/bio`), the header shows the cert chip:
- Pre-cert: "Awaiting certification by Marina · queued 2h ago"
- Post-cert: "Certified by Marina · 14 May" + a "Re-extract" button (rev-2 §2.1, 30 cr)

The "Re-extract" button kicks off a `POST /api/bios/:brandId/re-extract` (the rev-2 §11 endpoint).

**Acceptance:**
- New user finishes Discovery → sees the "Marina will certify within 24h" copy.
- BIO viewer header reflects current cert state in real time (subscribe to `bios` row via Supabase realtime).
- Re-extract button visible only on Tier 01+; rejected with cost prompt on Free.

### P1.5 acceptance summary

- [ ] Steward can sign in to team portal and see queued jobs.
- [ ] Steward can review a candidate BIO and certify it (with or without an edit).
- [ ] Certified BIOs become loadable via `loadBioForRun()`; uncertified ones return `BIO_NOT_CERTIFIED`.
- [ ] Rotation rule blocks self-cert (Steward who crafts on Vinilo cannot certify Vinilo's BIO).
- [ ] Capacity fallback to Lead Steward works when no eligible Steward available.
- [ ] Calibration second-review gate works behind feature flag.
- [ ] Client sees the cert chip in BIO viewer.
- [ ] Ledger has a `steward_cert` entry for every completed onboarding cert (even when 0 cr charged, for the §5.2 tripwire monitoring).

**P1.5 unblocks P3.** Do not start P3 until P1.5 acceptance is fully green.

---

## 6. P1.6 → P9 — forward-referenced outline

Each phase below gets its own ticket-level refinement before it starts. The key rev-2 hooks are flagged so the engineer knows what to plan for.

### P1.6 — Industry inference + confirmation (NEW from rev 2)

- Add `industry` inference to the a30 BIO Compiler output (`industry`, `industry_confidence`).
- End-of-Discovery confirmation step: *"We've placed Vinilo in **Hospitality & F&B** — change?"*
- Persist to `brands.industry`, `industry_confidence`, `industry_source`.
- Tiny `/admin/industries` CRUD (Supabase Studio is V1 sufficient; in-portal route is V2).

### P2 — Brief sharpening + clarifications (existing kernel plan, no rev-2 additions)

Per `apis-and-agents-plan.md §6 P2`. No modes-templates-steward additions here.

### P3 — First production specialist run + QA gate + footer split

- Per `apis-and-agents-plan.md §6 P3` for the runtime.
- **Rev-2 addition:** wire OutputCard footer (the two render functions from QW-004) to real `runs.model_used` + `bios.certified_by` data.
- **Rev-2 addition:** `loadBioForRun()` enforcement (P1.5-003) is the precondition.

### P4 — Text fan-out

- Per kernel plan §6 P4.
- **Rev-2 addition:** flip Template versions 2 (Awareness Sprint) and 5 (Lifecycle) to `status='live'`, `active=true`. Industry tagging + surface logic (`GET /api/templates`) live.

### P5 — Image specialist + storage + Manual Canvas v1

- Per kernel plan §6 P5.
- **Rev-2 addition:** Template 1 (Launch) goes live (needs Hero KV).
- **Rev-2 addition:** Manual Canvas v1 — text + image specialists only. The `ShellMode` primitive from QW-002 carries the workspace-mode UX. Model picker role-gated render per rev-2 §16 row 13.

### P6 — Composed outputs + Manual v2

- Per kernel plan §6 P6.
- **Rev-2 addition:** Templates 3 (Pricing Move) + 4 (Identity Set) go live. Manual Canvas v2 — all specialists.

### P7 — Multi-tenant + Stripe + tier gates

- Per kernel plan §6 P7.
- **Rev-2 addition:** enforce `template_versions.tier_from`, Manual mode access by tier, Steward onboarding cert bundling at Tier 02+, drift-check pricing per rev-2 §5.4 volume tiers.

### P7.5 — Recurring quarterly drift check (NEW from rev 2)

- Inngest cron job: every 24h, scan `bios` where `certified_at < now() - interval '90 days'` AND no open `steward_jobs.drift_check` exists → enqueue one.
- Capacity fallback (P1.5-002) reused.
- Drift-check pricing scales by `outputs_reviewed_count` per rev-2 §5.4 table.

### P8 — Soon→live + motion + ops + AI-queryable docs site

- Per kernel plan §6 P8.
- **Rev-2 addition:** `caastor-docs` repo on Nextra; `?ask=` endpoint from day one; three-layer allowlist (rev-2 §8.5) — service-role views (created in P0-003) + RLS + Haiku scrubber.

### P9 — Full template admin UI (NEW from rev 2)

- Team-portal route `/admin/templates`. Reuses the Manual mode Canvas as the assembly editor.
- Industry-specific templates added as client signal arrives (rev-2 §4.3).

---

## 7. Cross-cutting concerns

### 7.1 · Repo split — monorepo, single repo, today

The existing single repo absorbs the new `/server` and `/supabase` directories. **No multi-repo split until P8** when `caastor-docs` (Nextra) ships as a separate repo per rev-2 §8.4. Until then: one repo, three top-level directories (`src` for SPA, `server` for Worker API, `supabase` for migrations), one `pnpm-workspace.yaml` if any shared types emerge.

### 7.2 · Auth & RLS pattern

Every workspace-scoped table follows the same pattern: a column `workspace_id` (direct or via FK chain to `brands`) and an RLS policy that resolves `auth.uid() → users.workspace_id`. A migration helper function `apply_ws_isolation(table_name text)` generates the policy to avoid copy-paste drift.

The single highest-impact security test (rev-2 §14 risk row 4): two workspaces, two users, RLS prevents cross-reads. Add this to CI as a `pnpm test:rls` smoke test before P7.

### 7.3 · Naming migration — the `craft → humans` rename

Per QW-001 and rev-2 §2.3: route id stays `craft` in V1, label flips to `Humans`. The full rename (route id, file names `portal-craft.jsx → portal-humans.jsx`, all `craft` strings except where they mean "L3 craft work itself") lands as a single sweep PR in a later cleanup phase (target: alongside P7 when other workspace-shape touches happen anyway).

### 7.4 · `?ask=` allowlist views (rev-2 §8.5)

The `public_specs`, `public_template_versions`, `public_industries` views are created in P0-003. They are not consumed until P8 (Nextra docs site), but creating them in the initial migration avoids a later "we have to refactor the views" headache. The service-role key that the Nextra API route uses (P8) is granted SELECT on these views only — not on the underlying tables. The grant happens in P8 once the service role exists; the views are ready ahead of time.

### 7.5 · Cost / observability bootstrap

- `runs` row carries token counts + cost from P0-005 onwards (Ask Brandolph). This is the baseline for the rev-2 §5.2 Steward cost tripwire monitoring — every Steward cert charges a `ledger` row with `kind='steward_cert'`, even when `credits = 0` (Tier 02+ absorbed). A simple SQL query rolls up "average absorbed cost / cert over rolling 30 days" → drives the tripwire decision.

### 7.7 · Hybrid model routing — Anthropic direct + OpenRouter (LANDED 2026-05-25)

The refinement originally assumed direct Anthropic SDK calls only. The actual decision (per user mandate of *"impeccable experience and super clever economics"*) is a hybrid:

- **Anthropic direct** — all Claude calls (Opus, Sonnet, Haiku). 22 of 33 specialists + Brandolph L1. Preserves `cache_control: ephemeral` markers on PLATFORM + BIO layers — the §7 prompt-cache cost lever (60–80% input savings) only works with native Anthropic API.
- **OpenRouter** — non-Claude text only (GPT-5, Gemini Flash, Gemini Pro). 4 specialists today (a12, a14, plus headroom for future model swaps). One API key, one bill, OpenAI-compatible API. Per-call `cost_usd` exposed in `usage` for the cost ledger.
- **Vendor-specific** — image (Flux/Recraft/gpt-image-1), web (v0/Framer), deck (Gamma), search (Exa/Firecrawl), audio (ElevenLabs/Runway). One module per vendor under `server/src/lib/<vendor>.js` when their phase lands.

**Files:**

```
server/src/lib/models/
  anthropic.js      ← SDK adapter; preserves cache_control on system blocks
  openrouter.js     ← raw fetch + SSE parser; surfaces `cost_usd` from OpenRouter usage
  router.js         ← streamCompletion({ spec, system, messages }) — dispatches by prefix

scripts/
  seed-specs.mjs    ← MODEL_MAP rewrites short keys to vendor-prefixed routes
  test-router.mjs   ← exercises all paths; npm run test:router
```

**Routing convention** in `specs.payload.modelRouting.primary`:

| Prefix | Example | Handled by |
|---|---|---|
| `anthropic/` | `anthropic/claude-sonnet-4-6` | `lib/models/anthropic.js` (caching preserved) |
| `openrouter/` | `openrouter/openai/gpt-5` | `lib/models/openrouter.js` (OpenAI-compatible) |
| `vendor/` | `vendor/fal/flux-1.1-pro` | text router rejects; image/web/etc modules dispatch in their own phases |

**Normalized event stream** across all adapters:

```js
for await (const ev of streamCompletion({ spec, system, messages })) {
  if (ev.type === "token") { /* ev.text */ }
  else if (ev.type === "done")  { /* ev.usage = { prompt_tokens, completion_tokens, cached_tokens, cache_creation_tokens, provider, model, cost_usd? } */ }
  else if (ev.type === "error") { /* ev.message */ }
}
```

Consumers (routes, runtime) need zero vendor-aware code. Flipping a specialist from Sonnet → GPT-5 is a single SQL update to `specs.payload.modelRouting.primary`.

**Cache instrumentation** is captured in the normalized usage block (`cached_tokens`, `cache_creation_tokens`); the `runs` table already has `cached_tokens` for this. A weekly cron rolls cache hit % per specialist — targets >90% from 2nd call onwards in any assembly run (per apis-and-agents-plan §7).

**Cost tripwire hooks** (planned, drop into P3 alongside the runtime):

- Per-vendor monthly kill switch in a `vendor_status` table.
- Per-run hard timeout from spec.cr_estimate.
- Per-workspace daily ceiling.
- Cache hit rate <60% over 7 days → alert (caching is broken or BIO slicing isn't working).

### 7.6 · Testing strategy (minimum viable)

- **P0:** zero tests. Smoke via curl/manual.
- **P1.5:** add `vitest` for `server/lib/load-bio-for-run.ts` and `server/lib/steward-assigner.ts` — these are the moat-load-bearing functions. Cover the rotation rule and the capacity fallback.
- **P3:** add `vitest` for the Specialist Runtime (`server/lib/run-specialist.ts`) — particularly the prompt composition (`composeSpecialistPrompt`) since it determines cache hit rate.
- **P7:** add RLS smoke test before tier-gate logic ships.
- **No E2E framework** (Playwright/Cypress) in V1. Add when conversion-critical flows stabilise.

---

## 8. Sequencing summary

```
THIS WEEK (pre-P0):
  QW-001 Naming fix                       0.5 day  ← ship Monday
  QW-002 ShellMode primitive              1.5 day
  QW-003 Three-bucket Discovery (UI)      1 day
  QW-004 OutputCard footer split (mock)   0.5 day
                                          = ~3.5 dev days; ship by Friday

P0 (1 week):
  P0-001 Project bootstrap                0.5 day
  P0-002 Supabase provisioned             0.5 day  (parallel w/ 001)
  P0-003 Schema bootstrap migration       1.5 days ← the gate
  P0-004 Auth wiring                      1 day
  P0-005 Ask Brandolph streaming          1 day
  P0-006 Specs seed                       0.5 day
  P0-007 CI/deploy                        0.5 day
                                          = 5 dev days

P1 (2 weeks):
  P1-001 Discovery start + Inngest job    2 days
  P1-002 Discovery SSE                    1 day
  P1-003 Three-bucket upload backend      1 day
  P1-004 BIO editor write path            1 day
  P1-005 bioSlices composer refactor      2 days
                                          = 7 dev days + integration

P1.5 (1.5 weeks):                          ← CRITICAL PATH, gates P3
  P1.5-001 Steward queue UI               3 days
  P1.5-002 Assignment + rotation          1.5 days
  P1.5-003 BIO certification gate         0.5 day
  P1.5-004 Calibration second-review      1 day
  P1.5-005 BIO edit re-cert trigger       0.5 day
  P1.5-006 Client-facing notification     1 day
                                          = 7.5 dev days

P1.6 (3 days): industry inference + confirm + admin CRUD

→ Total to P1.5-green (the gate to P3): ~5–6 weeks of single-developer time
  or ~3 weeks of 2 developers working in parallel where dependencies allow.
```

---

## 9. Open engineering questions

The plan-rev-2 §13 lists the **product** open items (domain, Stripe IDs, Steward hourly rate). The remaining **engineering** open items, not covered by either plan:

1. **`pnpm` vs `npm`** — recommend `pnpm` for workspace support and faster installs. Confirm before P0-001.
2. **TypeScript on the SPA** — currently JSX-only. Recommend deferring full migration; add `jsconfig.json` + `// @ts-check` on critical files (`portal-shell.jsx`, `portal-brandolph.jsx`) as a halfway step. Full migration as a separate cleanup phase.
3. **Local dev parity** — Supabase CLI uses Docker. Confirm the team has Docker Desktop / OrbStack installed before P0-001.
4. **Inngest local** — Inngest dev server (`pnpm dlx inngest-cli dev`) requires the Worker to be reachable at `localhost:8787`. Add to the `concurrently` script in P0-001.
5. **Vendor account creation** — Anthropic, fal.run (P5), Firecrawl, Exa, Stripe (P7) — who creates these and where do the API keys live? Recommend: Oscar creates all five; keys land in 1Password vault `CaastorOS · staging`; engineer pulls into `.env.local` from there.

---

_End of refinement. Lift acceptance criteria into your tracker, start with QW-001, and the first PR can land today._

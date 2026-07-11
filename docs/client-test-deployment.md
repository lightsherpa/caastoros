# CaastorOS client-test deployment

This is the operating runbook for the invite-only Render pilot at `app.getcaastor.co`.

## Render

- Service type: Web Service
- Runtime: Node
- Plan: Free
- Branch: `feature/image-quality-overhaul`
- Build command: `npm ci --include=dev && npm run build && cd server && npm ci`
- Start command: `npm start`
- Health check path: `/healthz`
- Custom domain: `app.getcaastor.co`

`render.yaml` contains the same settings as code. Secret env vars are declared with `sync: false` so Render prompts for values without committing secrets.

## Required environment

Set these in Render:

- `NODE_ENV=production`
- `APP_URL=https://app.getcaastor.co`
- `ALLOWED_ORIGINS=https://app.getcaastor.co`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ANTHROPIC_API_KEY`
- `OPENROUTER_API_KEY`
- `FAL_API_KEY`
- `DISCOVERY_V2=1`
- `FIRECRAWL_API_KEY`
- `INNGEST_EVENT_KEY`
- `INNGEST_SIGNING_KEY`
- Optional: `RESEND_API_KEY`
- Optional: `EMAIL_FROM=CaastorOS <notifications@caastoros.com>`

Do not set `VITE_API_BASE` in production. The browser uses same-origin `/api/*`.

## DNS and connected services

1. Add `app.getcaastor.co` as a custom domain on the Render web service.
2. Add a DNS `CNAME` record:
   - Name: `app`
   - Target: the Render `.onrender.com` hostname for the service
3. Remove any conflicting `AAAA` record for `app`.
4. In Supabase Auth, allow `https://app.getcaastor.co` as an app/redirect URL.
5. In Inngest Cloud, sync the app endpoint: `https://app.getcaastor.co/api/inngest`.

## Pilot setup

Seed/update specialist specs:

```sh
npm run seed:specs
```

Grant the reviewer account Steward + Lead Steward access:

```sh
EMAIL=you@example.com npm run grant:steward
```

Grant a pilot client 900 credits:

```sh
EMAIL=client@example.com CREDITS=900 npm run grant:pilot-credits
```

## Preflight and smoke test

Before pushing:

```sh
npm run test:units
npm run build
```

After Render deploys:

```sh
curl https://app.getcaastor.co/healthz
```

Expected: JSON with `status:"ok"` and `hasKey:true`.

Then run one full rehearsal:

1. Sign in as pilot client.
2. Run Full V2 Discovery.
3. Confirm Inngest writes a BIO and queues a Steward job.
4. Certify the BIO from the team portal.
5. Run one Brandolph brief with 2-3 specialists.
6. Confirm outputs persist in Canvas/Library.
7. Confirm credits decrease and the client UI never shows internal API dollar costs.

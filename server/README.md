# caastoros-server

P0 backend skeleton: one streaming endpoint that turns the SPA's "Ask Brandolph" floater into a real Claude call, grounded in the seed BIO.

This is the kernel. Everything in P1+ (Discovery → BIO, brief sharpening, the 33 specialists) is config rows over the same shape.

## Quickstart

```bash
cd server
npm install
cp .env.example .env
# edit .env and paste your ANTHROPIC_API_KEY
npm run dev
```

The server logs `caastoros-server listening on http://localhost:8787`. Sanity check:

```bash
curl http://localhost:8787/
# → { "name": "caastoros-server", "status": "ok", "model": "claude-sonnet-4-6", "hasKey": true, ... }
```

## Wiring the SPA to the server

In the SPA root, create `.env`:

```
VITE_API_BASE=http://localhost:8787
```

Then `npm run dev` from the root. The Brandolph floater detects the API base and switches from the mock `fakeReply` to a streaming call against `/api/brandolph/ask`. No API base set → SPA keeps the old mock behaviour, nothing breaks.

## What ships in P0

- Hono on Node (portable to Cloudflare Workers later — single runtime swap)
- `POST /api/brandolph/ask` — SSE streaming, four-layer prompt with cache_control on PLATFORM + BIO
- Seed brand: Vinilo Coffee (mirrors `CI_DISCOVERY` in the SPA)
- CORS for Vite dev + preview origins
- No DB, no auth, no async queue yet — that arrives in P1+

## What ships next (P1)

- Supabase + the schema in `docs/apis-and-agents-plan.md` §5
- `/api/discovery/start` → real BIO from a URL
- `/api/bios/:brandId` reads + writes (the SPA BIO editor saves here)
- Inngest for any job that takes longer than the edge timeout

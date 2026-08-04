// ─────────────────────────────────────────────────────────────────────
// Local smoke test — the thing you read at a glance before committing.
//
// Assumes `npm run dev:all` is ALREADY running (web 5173, api 8787).
// It starts nothing and kills nothing.
//
// FREE TO RUN. Every check is either a plain read or an unauthenticated
// request that dies inside requireAuth — no model call, no image call, no
// discovery crawl. Nothing here spends credits.
//
// Run:  npm run smoke
//       EMAIL=you@example.com PASSWORD=... npm run smoke   (adds signed-in checks)
// ─────────────────────────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";

const API      = process.env.API_BASE || "http://localhost:8787";
const WEB      = process.env.WEB_BASE || "http://localhost:5173";
const EMAIL    = process.env.EMAIL;
const PASSWORD = process.env.PASSWORD;

let nPass = 0, nFail = 0, nSkip = 0, nNa = 0;
const line = (m, label, note) => console.log(`  ${m}  ${label.padEnd(38)}${note || ""}`);
const pass = (l, n) => { nPass++; line("PASS", l, n); };
const fail = (l, n) => { nFail++; line("FAIL", l, n); };
const skip = (l, n) => { nSkip++; line("skip", l, n); };
const na   = (l, n) => { nNa++;   line(" n/a", l, n); };
const head = (t) => console.log(`\n── ${t} ${"─".repeat(Math.max(0, 66 - t.length))}`);

async function hit(method, url, headers) {
  try {
    const res = await fetch(url, { method, headers, signal: AbortSignal.timeout(20000) });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not JSON — fine */ }
    return { status: res.status, text, json };
  } catch (e) {
    return { status: 0, text: "", json: null, err: e.message };
  }
}

console.log(`\nCaastorOS smoke — local`);
console.log(`api ${API} · web ${WEB}`);

// ── 0 · Is the API even up? Everything below is meaningless if not. ──
head("API reachable");
const health = await hit("GET", `${API}/healthz`);
if (health.status === 0) {
  fail("GET /healthz", `unreachable — ${health.err}`);
  console.log(`\n  The API at ${API} is not answering.`);
  console.log(`  Start it first:  npm run dev:all   (or npm run dev:server)`);
  console.log(`\n1 failed. Smoke test aborted.\n`);
  process.exit(1);
}
if (health.status !== 200) fail("GET /healthz", `${health.status} — expected 200`);
else pass("GET /healthz", `200 · ${health.json?.name || "?"} · model ${health.json?.model || "?"}`);

// ── 1 · Every route mounted and gated. Unauthenticated ⇒ 401. ──
// 404 = route not mounted. 2xx = anyone on the internet can read it.
// Both are release-blocking, so both fail loudly.
const ROUTES = [
  ["GET",   "/api/brandolph/memory"],
  ["POST",  "/api/brandolph/ask"],
  // Param routes are hit with a literal ":id" — requireAuth 401s long before
  // anything tries to parse it, which is exactly what we're asserting.
  ["GET",   "/api/bios/:brandId"],
  ["GET",   "/api/brands"],
  ["POST",  "/api/brands"],
  ["POST",  "/api/briefs/sharpen"],
  ["POST",  "/api/discovery/start"],
  ["GET",   "/api/steward/jobs"],
  ["GET",   "/api/team/overview"],
  ["POST",  "/api/runs/stream"],
  ["GET",   "/api/runs/:id"],
  ["PATCH", "/api/outputs/:id"],
  ["POST",  "/api/craft"],
  ["GET",   "/api/craft/queue"],
  ["GET",   "/api/credits"],
  ["GET",   "/api/workspace/members"],
  ["GET",   "/api/notifications"],
  ["GET",   "/api/notifications/prefs"],
  ["POST",  "/api/billing/checkout"],
  ["GET",   "/api/admin/specs"],
  // /api/billing/webhook is deliberately ungated (Stripe signs it) — not listed.
];

head("Route mounting + auth gate (unauthenticated ⇒ 401)");
for (const [method, path] of ROUTES) {
  const label = `${method.padEnd(5)} ${path}`;
  const r = await hit(method, `${API}${path}`);
  if (r.status === 401)                    pass(label, "401");
  else if (r.status === 404)               fail(label, "404 — ROUTE NOT MOUNTED");
  else if (r.status >= 200 && r.status < 300) fail(label, `${r.status} — OPEN TO THE PUBLIC, no auth required`);
  else if (r.status >= 500)                fail(label, `${r.status} — server error before the auth gate`);
  else if (r.status === 0)                 fail(label, `no response — ${r.err}`);
  else                                     fail(label, `${r.status} — expected 401`);
}
// Negative control: proves the 401s above are real gates and not a catch-all.
const bogus = await hit("GET", `${API}/api/definitely-not-a-route`);
if (bogus.status === 404) pass("GET   /api/<bogus> ⇒ 404", "404 · gate discriminates");
else fail("GET   /api/<bogus> ⇒ 404", `${bogus.status} — unmatched /api/* should 404`);

// ── 2 · Authenticated happy path ──
head("Authenticated happy path");
let jwt = null, role = null;
if (!EMAIL || !PASSWORD) {
  for (const l of ["GET /api/credits", "GET /api/workspace/members", "GET /api/brands", "GET /api/team/overview"])
    skip(l, "skipped — set EMAIL/PASSWORD");
} else if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
  fail("supabase sign-in", "SUPABASE_URL / SUPABASE_ANON_KEY missing — run via npm run smoke");
} else {
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
  const { data, error } = await sb.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  if (error) {
    fail("supabase sign-in", `${EMAIL} — ${error.message}`);
  } else {
    jwt = data.session.access_token;
    pass("supabase sign-in", EMAIL);
    const auth = { Authorization: `Bearer ${jwt}` };

    const cr = await hit("GET", `${API}/api/credits`, auth);
    const c = cr.json || {};
    if (cr.status !== 200) fail("GET /api/credits", `${cr.status} — expected 200`);
    else if (typeof c.balance !== "number") fail("GET /api/credits", `balance not numeric (${JSON.stringify(c.balance)})`);
    else if (typeof c.monthly !== "number" || typeof c.monthlyDebited !== "number") fail("GET /api/credits", "monthly / monthlyDebited not numeric");
    else if (typeof c.tier !== "string") fail("GET /api/credits", `tier not a string (${JSON.stringify(c.tier)})`);
    // Shape is what's asserted, but a negative balance means the ledger let a
    // run through below zero — worth seeing, not worth failing the smoke on.
    else pass("GET /api/credits", `${c.balance} cr${c.balance < 0 ? " ⚠ NEGATIVE" : ""} · tier ${c.tier} · ${c.monthlyDebited}/${c.monthly || "∞"} used`);

    const mem = await hit("GET", `${API}/api/workspace/members`, auth);
    const members = mem.json?.members;
    if (mem.status !== 200) fail("GET /api/workspace/members", `${mem.status} — expected 200`);
    else if (!Array.isArray(members)) fail("GET /api/workspace/members", "no members array");
    else if (!members.some((m) => m.email?.toLowerCase() === EMAIL.toLowerCase()))
      fail("GET /api/workspace/members", `${members.length} member(s) but ${EMAIL} is not among them`);
    else pass("GET /api/workspace/members", `${members.length} member(s), caller present`);

    const br = await hit("GET", `${API}/api/brands`, auth);
    if (br.status !== 200) fail("GET /api/brands", `${br.status} — expected 200`);
    else if (!Array.isArray(br.json?.brands)) fail("GET /api/brands", "no brands array");
    else pass("GET /api/brands", `${br.json.brands.length} brand(s): ${br.json.brands.map((b) => b.name).join(", ") || "(none)"}`);

    // 200 (team member) and 403 (client) are BOTH correct. 500 never is.
    const team = await hit("GET", `${API}/api/team/overview`, auth);
    role = team.status;
    if (team.status === 200)      pass("GET /api/team/overview", "200 — this account IS a team member");
    else if (team.status === 403) pass("GET /api/team/overview", "403 — this account is a plain client");
    else                          fail("GET /api/team/overview", `${team.status} — expected 200 or 403`);
  }
}

// ── 3 · Role gating is real (the cross-tenant guard) ──
head("Role gating — plain client must be denied");
if (!jwt) {
  skip("/api/team/overview ⇒ 403", "skipped — set EMAIL/PASSWORD");
  skip("/api/admin/specs   ⇒ 403", "skipped — set EMAIL/PASSWORD");
} else {
  const auth = { Authorization: `Bearer ${jwt}` };
  for (const [label, path, who] of [
    ["/api/team/overview ⇒ 403", "/api/team/overview", "a team member"],
    ["/api/admin/specs   ⇒ 403", "/api/admin/specs",   "an admin"],
  ]) {
    const r = await hit("GET", `${API}${path}`, auth);
    if (r.status === 403)      pass(label, "403 — client denied");
    else if (r.status === 200) na(label, `200 — test account IS ${who}; guard NOT exercised`);
    else                       fail(label, `${r.status} — expected 403 (or 200 for a privileged account)`);
  }
}

// ── 4 · The SPA serves ──
head("SPA");
const spa = await hit("GET", `${WEB}/`);
if (spa.status === 0)            fail(`GET ${WEB}/`, `unreachable — ${spa.err} (is the vite dev server up?)`);
else if (spa.status !== 200)     fail(`GET ${WEB}/`, `${spa.status} — expected 200`);
else if (!spa.text.includes('id="app"')) fail(`GET ${WEB}/`, `200 but no <div id="app"> in the body`);
else                             pass(`GET ${WEB}/`, `200 · app root present`);

// ── Summary ──
const bits = [`${nPass} passed`, `${nFail} failed`];
if (nSkip) bits.push(`${nSkip} skipped`);
if (nNa)   bits.push(`${nNa} not exercised`);
console.log(`\n${bits.join(" · ")} — ${nFail ? "SMOKE FAILED, do not commit" : "all good"}\n`);
process.exit(nFail ? 1 : 0);

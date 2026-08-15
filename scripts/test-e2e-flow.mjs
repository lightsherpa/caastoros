// ─────────────────────────────────────────────────────────────────────
// scripts/test-e2e-flow.mjs — the real CaastorOS product loop, end to end:
//
//   Discovery → BIO compiled + self-certified → brief sharpened
//   → specialist run → output stored
//
// ⚠️  SPENDS REAL MONEY (Firecrawl scrape, BIO synthesis, sharpener,
//     one specialist call + QA) and WRITES TO THE PRODUCTION SUPABASE.
//     Nothing is auto-deleted — the summary at the end lists every row
//     it created so you can clean up by hand.
//
// Prereqs: `npm run dev:all` (API on :8787 AND the Inngest dev server on
// :8288 — Discovery is an Inngest function, it will not run without it).
//
// Run everything:
//   EMAIL=you@example.com PASSWORD=... npm run test:e2e
//
// Re-run ONE phase without paying for the others:
//   PHASES=brief EMAIL=... PASSWORD=... npm run test:e2e
//   PHASES=bio   EMAIL=...              npm run test:e2e
//
// Preflight only — free, reads nothing but the DB, writes nothing:
//   PHASES=none EMAIL=... npm run test:e2e
//
// Env:
//   EMAIL                required. PASSWORD required only for brief/run.
//   PHASES               discovery,bio,brief,run (default all; "none" = preflight only)
//   BRAND_ID             default: first brand in the workspace — the same
//                        row loadBrandBio() picks when no brandId is passed
//   URL                  discovery scrape target (default: the brand's own url)
//   SPECIALIST           default a14 (Subject Lines · 2 cr · Gemini Flash Lite —
//                        cheapest live non-internal text agent, see src/portal-data.js)
//   BRIEF_TEXT           default: a short one-liner
//   ALLOW_IMAGE=1        permit an image-routed specialist (fal.ai spend). Off by default.
//   API_BASE             default http://localhost:8787
//   INNGEST_BASE_URL     default http://localhost:8288
//   DISCOVERY_TIMEOUT_MS default 300000 (5 min)
//   --help               print usage and exit. No network, no writes.
// ─────────────────────────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";
import { Inngest } from "inngest";

const ALL_PHASES = ["discovery", "bio", "brief", "run"];

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(
    [
      "Usage: EMAIL=... PASSWORD=... npm run test:e2e",
      "",
      "Phases (env PHASES=, comma separated, default all):",
      "  discovery  fire discovery/start, poll bios, assert certified=true / certified_by=null",
      "  bio        print + audit the compiled BIO (seed-contamination regression check)",
      "  brief      POST /api/briefs/sharpen, assert 200 not 409 BIO_NOT_CERTIFIED",
      "  run        one specialist run via /api/runs/stream, assert output row + provenance",
      "  none       preflight only (free, writes nothing)",
      "",
      "Other env: BRAND_ID, URL, SPECIALIST, BRIEF_TEXT, ALLOW_IMAGE,",
      "           API_BASE, INNGEST_BASE_URL, DISCOVERY_TIMEOUT_MS",
      "",
      "This script spends real money and writes production rows. Read the",
      "header of scripts/test-e2e-flow.mjs before running it.",
    ].join("\n"),
  );
  process.exit(0);
}

/* ── config ──────────────────────────────────────────────────────── */

const API_BASE      = process.env.API_BASE || "http://localhost:8787";
const INNGEST_URL   = process.env.INNGEST_BASE_URL || "http://localhost:8288";
const SPECIALIST    = process.env.SPECIALIST || "a14";
const BRIEF_TEXT    = process.env.BRIEF_TEXT || "One email subject line announcing the spring drop.";
const EMAIL         = process.env.EMAIL;
const PASSWORD      = process.env.PASSWORD;
const ALLOW_IMAGE   = process.env.ALLOW_IMAGE === "1";
const DISCOVERY_TIMEOUT_MS = Number(process.env.DISCOVERY_TIMEOUT_MS || 300_000);
const POLL_MS       = 3_000;

const rawPhases = (process.env.PHASES ?? ALL_PHASES.join(","))
  .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
const unknown = rawPhases.filter((p) => p !== "none" && !ALL_PHASES.includes(p));
if (unknown.length) {
  console.error(`Unknown PHASES: ${unknown.join(", ")}. Valid: ${ALL_PHASES.join(", ")}, none`);
  process.exit(1);
}
const PHASES = new Set(rawPhases.filter((p) => p !== "none"));
const wants = (p) => PHASES.has(p);

/* ── tiny reporting harness ──────────────────────────────────────── */

const started = Date.now();
const checks  = [];
const created = [];     // { table, detail } — printed at the end for cleanup
let creditsBefore = null;

function head(title) {
  console.log(`\n── ${title} ${"─".repeat(Math.max(2, 60 - title.length))}`);
}
function info(label, value) {
  console.log(`   ${String(label).padEnd(16)} ${value}`);
}
function check(name, pass, detail = "") {
  checks.push({ name, pass });
  console.log(`   ${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  return pass;
}
function warn(msg) { console.log(`   WARN  ${msg}`); }

async function summary(exitCode) {
  head("Summary");
  const failed = checks.filter((c) => !c.pass);
  for (const c of checks) if (!c.pass) console.log(`   FAILED: ${c.name}`);
  console.log(`   ${checks.length - failed.length}/${checks.length} checks passed · ${Math.round((Date.now() - started) / 1000)}s elapsed`);

  if (creditsBefore != null && ctx.workspaceId) {
    try {
      const after = await creditBalance(ctx.workspaceId);
      console.log(`   Credits: ${creditsBefore} → ${after}  (consumed ${creditsBefore - after})`);
    } catch (e) { warn(`credit re-read failed: ${e.message}`); }
  }

  console.log("\n   Rows this script created (NOT auto-deleted):");
  if (!created.length) console.log("     (none)");
  for (const row of created) console.log(`     ${row.table.padEnd(14)} ${row.detail}`);

  process.exit(exitCode ?? (failed.length ? 1 : 0));
}
async function die(msg) {
  console.error(`\n   ABORT: ${msg}`);
  await summary(1);
}

/* ── supabase (service role — same as scripts/test-discovery.mjs) ── */

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Run via `npm run test:e2e` (loads server/.env).");
  process.exit(1);
}
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Mirrors creditBalanceFromRows() in server/src/lib/credits.js: the ledger
// stores debits as positive `credits`, top-ups as negative.
async function creditBalance(workspaceId) {
  const { data, error } = await sb.from("ledger").select("credits").eq("workspace_id", workspaceId).limit(50_000);
  if (error) throw new Error(error.message);
  return -(data || []).reduce((sum, r) => sum + (Number(r.credits) || 0), 0);
}

const ctx = {};   // workspaceId, brand, spec, jwt, bio, sharpened, runId…

/* ── phase 0 · preflight (always, free) ──────────────────────────── */

head("Preflight");

if (!EMAIL) await die("EMAIL is required (resolves the workspace + brand under test).");
if ((wants("brief") || wants("run")) && !PASSWORD) await die("PASSWORD is required for the brief/run phases.");

// Env keys. Presence only — never printed.
const NEEDED = [
  ["SUPABASE_ANON_KEY", !!SUPABASE_ANON_KEY, wants("brief") || wants("run")],
  ["FIRECRAWL_API_KEY", !!process.env.FIRECRAWL_API_KEY, wants("discovery")],
  ["OPENROUTER_API_KEY", !!process.env.OPENROUTER_API_KEY, true],
  ["ANTHROPIC_API_KEY", !!process.env.ANTHROPIC_API_KEY, true],
  ["FAL_API_KEY", !!process.env.FAL_API_KEY, ALLOW_IMAGE],
];
for (const [name, present, required] of NEEDED) {
  if (required) check(`env ${name} present`, present);
  else if (!present) warn(`env ${name} missing (not needed for the selected phases)`);
}

// API reachable
try {
  const res = await fetch(`${API_BASE}/healthz`, { signal: AbortSignal.timeout(5_000) });
  const body = await res.json().catch(() => ({}));
  check(`API reachable at ${API_BASE}`, res.ok, body.status || `HTTP ${res.status}`);
  if (!res.ok) await die("API is not healthy. Start it with `npm run dev:all`.");
} catch (e) {
  check(`API reachable at ${API_BASE}`, false, e.message);
  await die("API is down. Start it with `npm run dev:all`.");
}

// Inngest dev server — Discovery is an Inngest function, it silently never
// runs without this. Any HTTP answer means the port is live.
let inngestUp = false;
try {
  await fetch(`${INNGEST_URL}/dev`, { signal: AbortSignal.timeout(5_000) });
  inngestUp = true;
} catch { inngestUp = false; }
if (wants("discovery")) {
  check(`Inngest dev server reachable at ${INNGEST_URL}`, inngestUp);
  if (!inngestUp) await die("Inngest dev server is down — Discovery would never execute. Start `npm run dev:all`.");
} else if (!inngestUp) {
  warn(`Inngest dev server not reachable at ${INNGEST_URL} (not needed — discovery phase is skipped)`);
}

// Workspace + brand
const { data: user, error: userErr } = await sb
  .from("users").select("id, email, workspace_id").ilike("email", EMAIL).maybeSingle();
if (userErr) await die(`user lookup failed: ${userErr.message}`);
if (!user?.workspace_id) await die(`No workspace for ${EMAIL}. Sign up via the SPA first.`);
ctx.workspaceId = user.workspace_id;

// Default brand = first brand in the workspace by created_at, which is exactly
// what loadBrandBio() resolves when the caller omits brandId. Keep them aligned
// or the brief/run would read a different brand's BIO than Discovery wrote.
let brandQuery = sb.from("brands").select("id, name, url, workspace_id, refusals").eq("workspace_id", ctx.workspaceId);
brandQuery = process.env.BRAND_ID
  ? brandQuery.eq("id", process.env.BRAND_ID)
  : brandQuery.order("created_at", { ascending: true }).limit(1);
const { data: brand, error: brandErr } = await brandQuery.maybeSingle();
if (brandErr) await die(`brand lookup failed: ${brandErr.message}`);
if (!brand) await die(process.env.BRAND_ID ? `Brand ${process.env.BRAND_ID} not in workspace ${ctx.workspaceId}` : `No brands in workspace ${ctx.workspaceId}`);
ctx.brand = brand;

const { data: workspace } = await sb.from("workspaces").select("id, name, tier").eq("id", ctx.workspaceId).maybeSingle();
const DISCOVERY_URL = process.env.URL || brand.url;

info("User", `${user.email}`);
info("Workspace", `${workspace?.name || ctx.workspaceId} · tier ${workspace?.tier || "00"}`);
info("Brand", `${brand.name} (${brand.id})`);
info("Brand URL", brand.url || "(none set on the brand row)");
info("Scrape URL", DISCOVERY_URL || "(none — set URL=…)");
info("Phases", PHASES.size ? [...PHASES].join(" → ") : "(preflight only)");
info("DISCOVERY_V2", process.env.DISCOVERY_V2 === "1" ? "1 (crawls ≤6 pages + screenshot + vision pass)" : "0 (single homepage scrape)");

// Specialist spec — the DB spec row is the source of truth for credits
// (server/src/lib/credits.js reads payload.cr_estimate), not portal-data.js.
const { data: spec, error: specErr } = await sb
  .from("specs").select("specialist_id, version, payload").eq("specialist_id", SPECIALIST).eq("active", true).maybeSingle();
if (specErr) await die(`spec lookup failed: ${specErr.message}`);
if (wants("run")) {
  check(`specialist ${SPECIALIST} has an active spec`, !!spec);
  if (!spec) await die(`No active spec for ${SPECIALIST}. Seed it with \`npm run seed:specs\`.`);
} else if (!spec) {
  warn(`no active spec for ${SPECIALIST} (run phase is skipped, so it does not matter here)`);
}
ctx.spec = spec;

const route      = spec?.payload?.modelRouting?.primary || "";
const isImage    = route.startsWith("vendor/fal/");   // mirrors isImageRoute() in lib/models/fal-image.js
const runCredits = Math.max(1, Math.ceil(Number(spec?.payload?.cr_estimate) || 8));
info("Specialist", spec ? `${SPECIALIST} · ${spec.payload?.name || "?"} · v${spec.version}` : `${SPECIALIST} (no active spec)`);
info("Route", `${route || "(unknown)"}${isImage ? "  ← IMAGE" : ""}`);
info("Run cost", `${runCredits} credits`);
if (wants("run")) check("no image generation unless ALLOW_IMAGE=1", !isImage || ALLOW_IMAGE, isImage ? `${SPECIALIST} routes to ${route}` : "text specialist");
if (isImage && !ALLOW_IMAGE) {
  await die(`${SPECIALIST} is an image specialist. Re-run with ALLOW_IMAGE=1 if you really mean to pay for generation.`);
}

// Credit balance — printed before anything is spent.
creditsBefore = await creditBalance(ctx.workspaceId);
const MONTHLY_POOL = { "00": 300, "01": 800, "02": 1500, "03": 0 };   // mirrors server/src/lib/plan-limits.js
const pool = MONTHLY_POOL[workspace?.tier] ?? MONTHLY_POOL["00"];
info("Credit balance", `${creditsBefore} cr  (monthly pool ${pool === 0 ? "unlimited" : pool})`);
if (creditsBefore <= 0) {
  console.log("");
  console.log("   ############################################################");
  console.log("   #  CREDIT BALANCE IS AT OR BELOW ZERO                      #");
  console.log("   #  /api/runs/stream will fail the credit check with 402    #");
  console.log("   #  OUT_OF_CREDITS. Fund it before the run phase:           #");
  console.log(`   #    EMAIL=${EMAIL} CREDITS=900 npm run grant:pilot-credits`);
  console.log("   #  (this script will NOT fund it for you)                  #");
  console.log("   ############################################################");
  console.log("");
} else if (wants("run") && creditsBefore < runCredits) {
  warn(`balance ${creditsBefore} < ${runCredits} needed for this run — fund with \`EMAIL=${EMAIL} CREDITS=900 npm run grant:pilot-credits\``);
}

if (!PHASES.size) {
  console.log("\n   Preflight only (PHASES=none). Nothing was spent, nothing was written.");
  await summary(0);
}

/* ── phase 1 · discovery ─────────────────────────────────────────── */

if (wants("discovery")) {
  head("Discovery");
  if (!DISCOVERY_URL) await die("No URL to scrape. Set URL=https://… or give the brand a url.");

  console.log(`   Estimated cost: 0 credits debited (Discovery is not ledger-metered).`);
  console.log(`   Real vendor spend: ${process.env.DISCOVERY_V2 === "1" ? "up to 7 Firecrawl scrapes" : "1 Firecrawl scrape"} + 1 BIO synthesis + 1 cheap verifier${process.env.DISCOVERY_V2 === "1" ? " + 1 cheap vision call" : ""}.`);

  const { data: latest } = await sb
    .from("bios").select("version").eq("brand_id", brand.id)
    .order("version", { ascending: false }).limit(1).maybeSingle();
  const baseVersion = latest?.version || 0;
  info("Existing BIO", baseVersion ? `v${baseVersion}` : "(none)");

  const inngest = new Inngest({ id: "caastor-os", isDev: true, baseUrl: INNGEST_URL });
  const t0 = Date.now();
  let eventId;
  try {
    const sent = await inngest.send({
      name: "discovery/start",
      data: { brandId: brand.id, url: DISCOVERY_URL, workspaceId: ctx.workspaceId },
    });
    eventId = sent.ids?.[0];
  } catch (e) {
    await die(`discovery/start send failed: ${e.message}`);
  }
  info("Event fired", `${eventId || "(no id)"} · watch ${INNGEST_URL}/runs`);

  let bioRow = null;
  while (Date.now() - t0 < DISCOVERY_TIMEOUT_MS) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    const { data } = await sb
      .from("bios")
      .select("id, version, score, certified, certified_by, certified_at, cert_kind, payload, created_at")
      .eq("brand_id", brand.id).gt("version", baseVersion)
      .order("version", { ascending: false }).limit(1).maybeSingle();
    if (data) { bioRow = data; break; }
    process.stdout.write(`\r   waiting… ${Math.round((Date.now() - t0) / 1000)}s`);
  }
  process.stdout.write("\r" + " ".repeat(40) + "\r");

  if (!bioRow) {
    check("discovery produced a new bios row", false, `timed out after ${Math.round(DISCOVERY_TIMEOUT_MS / 1000)}s`);
    await die(
      `No bios row with version > ${baseVersion} for brand ${brand.id} after ${Math.round(DISCOVERY_TIMEOUT_MS / 1000)}s.\n` +
      `          Check the run at ${INNGEST_URL}/runs — Firecrawl or the compiler probably threw.\n` +
      `          If it is just slow, re-run with a bigger DISCOVERY_TIMEOUT_MS.`,
    );
  }

  const elapsed = Math.round((Date.now() - t0) / 1000);
  created.push({ table: "bios", detail: `${bioRow.id} (v${bioRow.version}, brand ${brand.id})` });
  created.push({ table: "bio_sources", detail: `1+ rows for brand ${brand.id} (one per scraped page)` });
  created.push({ table: "steward_jobs", detail: `1 queued 'onboarding' job for bio ${bioRow.id}` });

  check("discovery produced a new bios row", true, `v${bioRow.version} in ${elapsed}s`);
  info("Version", `v${bioRow.version}`);
  info("Score", `${bioRow.score}`);
  info("certified", String(bioRow.certified));
  info("certified_by", bioRow.certified_by === null ? "null" : String(bioRow.certified_by));
  info("certified_at", bioRow.certified_at || "null");
  info("Elapsed", `${elapsed}s`);

  // The two-tier rule (server/src/inngest/functions/compile-bio.js step 3):
  // Discovery self-certifies (tier 1) so briefs are never blocked, but claims
  // no human attribution — certified_by stays NULL until a Steward signs.
  check("two-tier rule · certified === true", bioRow.certified === true, `got ${bioRow.certified}`);
  check("two-tier rule · certified_by === null", bioRow.certified_by === null, `got ${bioRow.certified_by}`);
  check("certified_at is set", !!bioRow.certified_at);

  ctx.bio = bioRow;
}

/* ── phase 2 · BIO inspection + seed-contamination regression ────── */

if (wants("bio")) {
  head("BIO inspection");

  let bioRow = ctx.bio;
  if (!bioRow) {
    const { data } = await sb
      .from("bios")
      .select("id, version, score, certified, certified_by, certified_at, cert_kind, payload, created_at")
      .eq("brand_id", brand.id).order("version", { ascending: false }).limit(1).maybeSingle();
    bioRow = data;
  }
  if (!bioRow) await die(`No BIO for brand ${brand.id}. Run the discovery phase first.`);
  ctx.bio = bioRow;

  const p = bioRow.payload || {};
  info("BIO", `v${bioRow.version} · score ${bioRow.score} · certified=${bioRow.certified} · certified_by=${bioRow.certified_by ?? "null"}`);
  info("positioning", p.identity?.positioning || "(empty)");
  info("category", p.identity?.category || "(empty)");
  info("founded", p.identity?.founded ?? "(empty)");
  info("pillars", (p.identity?.pillars || []).join(" · ") || "(empty)");
  info("audience", p.audience?.primary || "(empty)");
  info("voice", p.voice?.register || "(empty)");
  info("forbidden", (p.voice?.forbidden || []).join(", ") || "(empty)");
  info("northStar", p.goals?.northStar || "(empty)");
  info("watchouts", (p.strategic?.watchouts || []).join(" · ") || "(empty)");
  info("notList", (p.strategic?.notList || []).join(" · ") || "(empty)");
  info("visual", `palette ${p.visual?.palette?.length || 0} · type ${p.visual?.type?.length || 0} · imagery ${p.visual?.imagery?.length || 0}`);
  info("refusals", `${(p.refusals || []).length} in payload · ${(brand.refusals || []).length} on the brand row`);
  info("missing", `${(p.missing || []).length} fields flagged unsupported`);

  check("BIO has a positioning line", !!p.identity?.positioning);
  check("BIO score is a number", typeof bioRow.score === "number", String(bioRow.score));

  // Regression test for the cross-brand data leak: the seed brand's facts must
  // never appear in another brand's payload. A needle only counts as
  // contamination when the brand under test is NOT that brand.
  const NEEDLES = ["vinilo", "honduras", "marina", "11.4"];
  const identity = `${brand.name || ""} ${brand.url || ""} ${DISCOVERY_URL || ""}`.toLowerCase();
  const serialized = JSON.stringify(bioRow.payload || {});
  const lower = serialized.toLowerCase();
  const hits = [];
  for (const needle of NEEDLES) {
    if (identity.includes(needle)) continue;          // legitimately this brand's own
    const at = lower.indexOf(needle);
    if (at >= 0) hits.push({ needle, excerpt: serialized.slice(Math.max(0, at - 70), at + 70) });
  }
  check("no seed-brand contamination in the BIO payload", hits.length === 0, hits.length ? hits.map((h) => h.needle).join(", ") : `${NEEDLES.length} needles clean`);
  for (const h of hits) console.log(`         ${h.needle} → …${h.excerpt}…`);
}

/* ── auth (shared by the brief + run phases) ─────────────────────── */

if (wants("brief") || wants("run")) {
  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: auth, error } = await anon.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  if (error) await die(`sign-in failed: ${error.message}`);
  ctx.jwt = auth.session.access_token;
}

/* ── phase 3 · brief sharpening ──────────────────────────────────── */

if (wants("brief")) {
  head("Brief · POST /api/briefs/sharpen");
  console.log("   Estimated cost: 0 credits debited (sharpening is not ledger-metered). One Sonnet-class call.");

  const res = await fetch(`${API_BASE}/api/briefs/sharpen`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ctx.jwt}` },
    body: JSON.stringify({ briefText: BRIEF_TEXT, brandId: brand.id }),
  });
  const json = await res.json().catch(() => ({}));

  // 409 BIO_NOT_CERTIFIED is the exact bug that blocked all brief production
  // before Discovery started self-certifying. Call it out by name.
  if (res.status === 409 && json.code === "BIO_NOT_CERTIFIED") {
    check("sharpen returns 200 (not 409 BIO_NOT_CERTIFIED)", false, "409 BIO_NOT_CERTIFIED — self-certification did not stick");
    await die("The BIO is not certified. Check bios.certified for this brand, and the write-bio-row step in compile-bio.js.");
  }
  check("sharpen returns 200 (not 409 BIO_NOT_CERTIFIED)", res.ok, res.ok ? "" : `HTTP ${res.status}: ${json.error || ""}`);
  if (!res.ok) await die(`sharpen failed: HTTP ${res.status}`);

  const proposed = json.proposedSpecialists || [];
  info("Title", json.title || "(empty)");
  info("Tension", json.tension || "(empty)");
  info("Sharpened", json.sharpenedBrief || "(empty)");
  info("Questions", `${(json.questions || []).length}`);
  info("Specialists", proposed.join(", ") || "(none)");
  info("Plan groups", `${(json.deliveryPlan?.deliverableGroups || []).length}`);
  info("BIO version", `v${json.brand?.bioVersion ?? "?"}`);

  check("sharpened brief is non-empty", !!String(json.sharpenedBrief || "").trim());
  check("proposed at least one specialist", proposed.length >= 1, `${proposed.length}`);

  ctx.sharpened = json;
}

/* ── phase 4 · specialist run ────────────────────────────────────── */

if (wants("run")) {
  head(`Run · ${SPECIALIST} via /api/runs/stream`);
  console.log(`   Estimated cost: ${runCredits} credits, debited from workspace ${ctx.workspaceId}.`);
  console.log(`   One ${route} call + one QA call. No image generation${ALLOW_IMAGE ? " unless the specialist routes to fal" : ""}.`);

  const briefForRun = ctx.sharpened?.sharpenedBrief?.trim() || BRIEF_TEXT;
  const res = await fetch(`${API_BASE}/api/runs/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ctx.jwt}` },
    body: JSON.stringify({
      specialistId: SPECIALIST,
      briefText: briefForRun,
      brandId: brand.id,
      briefMeta: ctx.sharpened
        ? {
            title:          ctx.sharpened.title,
            rawBrief:       BRIEF_TEXT,
            sharpenedBrief: ctx.sharpened.sharpenedBrief,
            tension:        ctx.sharpened.tension,
            refusals:       ctx.sharpened.refusals,
          }
        : undefined,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    check("run stream accepted", false, `HTTP ${res.status}: ${text.slice(0, 200)}`);
    await die(res.status === 402 ? "Out of credits. Fund with `npm run grant:pilot-credits`." : `run failed: HTTP ${res.status}`);
  }
  check("run stream accepted", true);

  console.log("\n   ─── streaming ───\n");
  const reader  = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "", qa = null, done = null, streamErr = null;
  while (true) {
    const { value, done: streamDone } = await reader.read();
    if (streamDone) break;
    buf += decoder.decode(value, { stream: true });
    const events = buf.split("\n\n");
    buf = events.pop() || "";
    for (const ev of events) {
      const lines = ev.split("\n");
      const dataLine = lines.find((l) => l.startsWith("data:"));
      if (!dataLine) continue;
      const type = lines.find((l) => l.startsWith("event:"))?.slice(6).trim();
      let data; try { data = JSON.parse(dataLine.slice(5).trim()); } catch { continue; }
      if (type === "token") process.stdout.write(data.text);
      else if (type === "qa") qa = data;
      else if (type === "done") done = data;
      else if (type === "error") streamErr = data.message;
    }
  }
  console.log("\n   ─────────────────\n");

  if (streamErr) {
    check("run completed without a stream error", false, streamErr);
    await die(`the run stream errored: ${streamErr}`);
  }
  check("run completed without a stream error", true);
  check("done event carries a runId", !!done?.runId, done?.runId || "(missing)");
  check("done event carries an outputId", !!done?.outputId, done?.outputId || "(missing)");
  if (!done?.runId) await die("no runId in the done event — nothing to verify in the DB.");

  created.push({ table: "briefs",   detail: `${done.briefId} (created by this run)` });
  created.push({ table: "runs",     detail: `${done.runId}` });
  created.push({ table: "outputs",  detail: `${done.outputId}` });
  created.push({ table: "qa_results", detail: `1 row for output ${done.outputId}` });
  created.push({ table: "ledger",   detail: `1 debit row · ${done.credits_debited} cr · run ${done.runId}` });
  created.push({ table: "brand_signals", detail: `1+ rows for brand ${brand.id}` });

  info("QA passed", String(qa?.passed));
  info("voice_match", `${qa?.voice_match ?? "n/a"}`);
  info("violations", qa?.violations?.length ? qa.violations.join(" · ") : "(none)");
  info("Model", `${done.usage?.model || "?"} via ${done.usage?.provider || "?"}`);
  info("Credits", `${done.credits_debited} cr`);

  // The canvas provenance footer renders from runs.bio_version + runs.latency_ms.
  // Both must be populated or the footer silently loses its attribution.
  const { data: runRow, error: runErr } = await sb
    .from("runs").select("id, bio_version, latency_ms, status, model_used, spec_version").eq("id", done.runId).maybeSingle();
  if (runErr) await die(`runs read-back failed: ${runErr.message}`);
  const { data: outputRows } = await sb
    .from("outputs").select("id, run_id, kind, status, body").eq("run_id", done.runId);

  check("an outputs row landed with this run_id", (outputRows || []).length > 0, `${(outputRows || []).length} row(s)`);
  check("run status is completed", runRow?.status === "completed", runRow?.status || "(missing)");
  check("runs.bio_version is populated", runRow?.bio_version != null, `v${runRow?.bio_version}`);
  check("runs.latency_ms is populated", runRow?.latency_ms != null, `${runRow?.latency_ms}ms`);
  info("bio_version", `v${runRow?.bio_version} (BIO the output is provenanced to)`);
  info("latency_ms", `${runRow?.latency_ms}`);
  info("output kind", `${outputRows?.[0]?.kind || "?"} · status ${outputRows?.[0]?.status || "?"}`);
}

await summary();

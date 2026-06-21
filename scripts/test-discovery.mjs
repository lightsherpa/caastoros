// ─────────────────────────────────────────────────────────────────────
// End-to-end Discovery test — fires a "discovery/start" event for the
// first brand in the DB. Watch the run in the Inngest dev UI at
// http://localhost:8288.
//
// After it completes (~10–30s for scrape + Opus synthesis), a new
// `bios` row will exist for the brand with certified=false.
//
// Run:  URL=https://vinilo.coffee npm run test:discovery
// ─────────────────────────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";
import { Inngest } from "inngest";

const url = process.env.URL || "https://vinilo.coffee";

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in env");
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Pick the first brand (auto-created on signup by the handle_new_auth_user trigger)
const { data: brand, error } = await sb
  .from("brands")
  .select("id, name, workspace_id, url")
  .order("created_at", { ascending: true })
  .limit(1)
  .maybeSingle();

if (error || !brand) {
  console.error("No brands found. Sign up via the SPA first (http://localhost:5173).");
  process.exit(1);
}

console.log(`Target brand: ${brand.name} (${brand.id})`);
console.log(`Scrape URL:   ${url}`);

const inngest = new Inngest({
  id: "caastor-os",
  isDev: true,
  baseUrl: process.env.INNGEST_BASE_URL || "http://localhost:8288",
});

const result = await inngest.send({
  name: "discovery/start",
  data: { brandId: brand.id, url, workspaceId: brand.workspace_id },
});

console.log(`\nEvent fired. ID: ${result.ids?.[0] || "(none)"}`);
console.log(`Watch the run: http://localhost:8288/runs`);
console.log(`When it completes, check bios:\n  select id, version, certified, payload->'identity'->>'positioning' as positioning from bios where brand_id = '${brand.id}' order by version desc limit 1;`);

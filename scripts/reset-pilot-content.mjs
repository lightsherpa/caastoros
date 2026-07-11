import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const workspaceId = process.env.WORKSPACE_ID || "";
const brandId = process.env.BRAND_ID || "";
const confirmed = process.env.CONFIRM_RESET === "delete-content";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  process.exit(1);
}

if (!workspaceId && !brandId) {
  console.error("Set WORKSPACE_ID or BRAND_ID. Dry-run is the default.");
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function must(label, promise) {
  const { data, error, count } = await promise;
  if (error) throw new Error(`${label}: ${error.message}`);
  return { data, count };
}

const brandQuery = sb.from("brands").select("id, name, workspace_id").order("created_at", { ascending: true });
const { data: brands } = await must(
  "brands lookup",
  brandId ? brandQuery.eq("id", brandId) : brandQuery.eq("workspace_id", workspaceId)
);

if (!brands?.length) {
  console.log("No brands matched the reset target.");
  process.exit(0);
}

const brandIds = brands.map((brand) => brand.id);
const workspaceIds = [...new Set(brands.map((brand) => brand.workspace_id).filter(Boolean))];

const { data: briefs } = await must(
  "briefs lookup",
  sb.from("briefs").select("id, title, brand_id").in("brand_id", brandIds)
);
const briefIds = (briefs || []).map((brief) => brief.id);

const { data: runs } = briefIds.length
  ? await must("runs lookup", sb.from("runs").select("id, brief_id").in("brief_id", briefIds))
  : { data: [] };
const runIds = (runs || []).map((run) => run.id);

const { data: outputs } = briefIds.length
  ? await must("outputs lookup", sb.from("outputs").select("id, brief_id").in("brief_id", briefIds))
  : { data: [] };

const { data: signals } = await must(
  "brand_signals lookup",
  sb.from("brand_signals").select("id, brand_id").in("brand_id", brandIds)
);

const { data: stats } = await must(
  "brand_specialist_stats lookup",
  sb.from("brand_specialist_stats").select("brand_id, specialist_id").in("brand_id", brandIds)
);

const { data: notifications } = await must(
  "notifications lookup",
  sb.from("notifications").select("id, brand_id").in("brand_id", brandIds)
);

const { data: ledgerRows } = runIds.length
  ? await must("ledger lookup", sb.from("ledger").select("id, run_id, kind, credits").in("run_id", runIds))
  : { data: [] };

console.log("Reset target:");
for (const brand of brands) console.log(`- ${brand.name || "(unnamed)"} ${brand.id}`);

console.log("\nWill delete:");
console.log(`- briefs: ${briefs?.length || 0}`);
console.log(`- runs: ${runs?.length || 0}`);
console.log(`- outputs: ${outputs?.length || 0} (qa_results cascade through outputs)`);
console.log(`- run-linked ledger rows: ${ledgerRows?.length || 0}`);
console.log(`- brand_signals: ${signals?.length || 0}`);
console.log(`- brand_specialist_stats rows: ${stats?.length || 0}`);
console.log(`- brand notifications: ${notifications?.length || 0}`);

console.log("\nWill keep:");
console.log("- users, workspaces, brands, BIOs, bio_sources, uploads, specs, templates, topups/monthly ledger rows");

if (!confirmed) {
  console.log("\nDry run only. To execute, rerun with CONFIRM_RESET=delete-content.");
  process.exit(0);
}

if (ledgerRows?.length) await must("delete ledger", sb.from("ledger").delete().in("id", ledgerRows.map((row) => row.id)));
if (notifications?.length) await must("delete notifications", sb.from("notifications").delete().in("id", notifications.map((row) => row.id)));
if (signals?.length) await must("delete brand_signals", sb.from("brand_signals").delete().in("id", signals.map((row) => row.id)));
if (stats?.length) {
  for (const brand of brandIds) {
    await must("delete brand_specialist_stats", sb.from("brand_specialist_stats").delete().eq("brand_id", brand));
  }
}
if (briefIds.length) await must("delete briefs", sb.from("briefs").delete().in("id", briefIds));

console.log("\nReset complete.");
console.log(`Workspace scope: ${workspaceIds.join(", ") || "(unknown)"}`);

// ─────────────────────────────────────────────────────────────────────
// One-shot backfill: self-certify BIOs written before two-tier cert landed.
//
// Every BIO used to be inserted certified=false, and only a Steward could
// flip it. loadBioForRun serves the highest CERTIFIED version, so those rows
// blocked every brief with "BIO is awaiting Brand Steward certification".
// New compiles/edits self-certify on write; this catches the existing rows.
//
// Only touches the latest version per brand — older versions stay as they
// are, so history still reflects what was actually certified when.
// certified_by stays NULL: no human signed these, so none is claimed.
//
// Run:  npm run backfill:self-cert          (add DRY=1 to preview)
// ─────────────────────────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing (run via npm script so --env-file applies)");
  process.exit(1);
}
const dryRun = process.env.DRY === "1";
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: brands, error: brandErr } = await sb.from("brands").select("id, name");
if (brandErr) { console.error("brands query failed:", brandErr.message); process.exit(1); }

let flipped = 0, skipped = 0;
for (const brand of brands || []) {
  const { data: bio } = await sb
    .from("bios")
    .select("id, version, score, certified")
    .eq("brand_id", brand.id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!bio) { console.log(`— ${brand.name}: no BIO (run Discovery)`); skipped++; continue; }
  if (bio.certified) { console.log(`— ${brand.name}: v${bio.version} already certified`); skipped++; continue; }

  if (dryRun) {
    console.log(`~ ${brand.name}: would self-certify v${bio.version} (score ${bio.score})`);
    flipped++;
    continue;
  }

  const { error } = await sb
    .from("bios")
    .update({ certified: true, certified_at: new Date().toISOString() })
    .eq("id", bio.id);
  if (error) { console.error(`! ${brand.name}: ${error.message}`); continue; }
  console.log(`✓ ${brand.name}: self-certified v${bio.version} (score ${bio.score})`);
  flipped++;
}

console.log(`\n${dryRun ? "[dry run] " : ""}${flipped} self-certified, ${skipped} skipped.`);

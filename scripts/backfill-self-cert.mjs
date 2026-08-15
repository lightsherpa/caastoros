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
// SAFETY: this flips historical BIOs to certified=true with certified_by=NULL,
// which makes legacy, never-human-reviewed BIOs runnable. It is a one-shot
// migration and should NOT be re-run casually. A live write now requires
// CONFIRM=1; without it the script previews (dry run) and exits. If tier-2 is
// enforced (REQUIRE_HUMAN_CERT=1, see CAA-25) these self-certified rows are
// blocked from runs anyway, since loadBioForRun also requires certified_by.
//
// Run:  DRY=1 npm run backfill:self-cert      (preview — default)
//       CONFIRM=1 npm run backfill:self-cert  (actually write)
// ─────────────────────────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing (run via npm script so --env-file applies)");
  process.exit(1);
}
// Preview unless the operator explicitly confirms the write. `DRY=1` still forces
// preview; the new default (no CONFIRM) is preview too, so an accidental invocation
// can never silently mass-self-certify.
const dryRun = process.env.DRY === "1" || process.env.CONFIRM !== "1";
if (dryRun && process.env.CONFIRM !== "1") {
  console.log("[preview] set CONFIRM=1 to actually write. Showing what would change:\n");
}
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

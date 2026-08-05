// Loads a brand + its currently-active BIO from Supabase.
//
// Per modes-templates-steward-plan.md rev-2 §5.5 (`loadBioForRun()`):
// specialist runs must read a CERTIFIED BIO. Certification is two-tier —
// Discovery self-certifies its own compile (certified=true, certified_by
// null) so briefs are never blocked, and a senior Steward can then
// re-certify to attach the human attribution (certified_by set).
//
// Returns { brand, bio, refusals } shaped for prompt.js consumption.

import { supabaseAdmin } from "./supabase.js";

/**
 * @param {object} opts
 * @param {string} opts.workspaceId        - caller's workspace from auth middleware
 * @param {string} [opts.brandId]          - specific brand; defaults to first brand in workspace
 * @param {boolean} [opts.requireCertified=false] - true once P1.5 lands; throws BIO_NOT_CERTIFIED otherwise
 */
export async function loadBrandBio({ workspaceId, brandId, requireCertified = false }) {
  // Resolve brand
  let brandRow;
  if (brandId) {
    const { data, error } = await supabaseAdmin
      .from("brands")
      .select("id, name, url, workspace_id, refusals")
      .eq("id", brandId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (error) throw new Error(`Brand lookup failed: ${error.message}`);
    if (!data) throw new Error(`Brand ${brandId} not found in workspace`);
    brandRow = data;
  } else {
    const { data, error } = await supabaseAdmin
      .from("brands")
      .select("id, name, url, workspace_id, refusals")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`Brand lookup failed: ${error.message}`);
    if (!data) throw new Error(`No brands in workspace ${workspaceId}`);
    brandRow = data;
  }

  // Resolve latest BIO. Filter by `certified=true` once P1.5 is live.
  let bioQuery = supabaseAdmin
    .from("bios")
    .select("id, version, payload, score, certified, certified_by, certified_at, cert_kind")
    .eq("brand_id", brandRow.id);
  if (requireCertified) bioQuery = bioQuery.eq("certified", true);
  const { data: bioRow, error: bioErr } = await bioQuery
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (bioErr) throw new Error(`BIO lookup failed: ${bioErr.message}`);

  // No BIO yet (brand auto-created on signup, never ran Discovery). There is
  // no seed fallback on purpose: serving another brand's BIO here leaked that
  // brand's positioning and refusals into this brand's prompts.
  if (!bioRow) {
    const err = new Error(
      requireCertified
        ? `BIO_NOT_CERTIFIED for brand ${brandRow.id}`
        : `No BIO for brand ${brandRow.name || brandRow.id}. Run Discovery to build one.`
    );
    err.code = requireCertified ? "BIO_NOT_CERTIFIED" : "NO_BIO";
    throw err;
  }

  return {
    brand:    { id: brandRow.id, name: brandRow.name, url: brandRow.url, tagline: bioRow.payload?.identity?.positioning },
    bio: {
      ...bioRow.payload,
      id:           bioRow.id,
      version:      bioRow.version,
      score:        bioRow.score,
      certified:    bioRow.certified,
      certified_by: bioRow.certified_by,
      certified_at: bioRow.certified_at,
      cert_kind:    bioRow.cert_kind,
    },
    // Only this brand's own refusals. An empty list means "no hard don'ts
    // recorded yet" — never borrow another brand's.
    refusals: brandRow.refusals || [],
  };
}

/**
 * Strict variant for the P3 Specialist Runtime — ALWAYS requires a
 * certified BIO. Throws BIO_NOT_CERTIFIED if the brand has no
 * certified version yet (i.e. Steward hasn't signed). Specialist
 * code MUST go through this loader; bypassing it skips the moat-
 * defining "certified by {Steward}" attribution on every output.
 *
 * Per rev-2 §5.5: "loadBioForRun() in P1.5-003 selects the highest-
 * version row where certified = true."
 */
export function loadBioForRun({ workspaceId, brandId }) {
  return loadBrandBio({ workspaceId, brandId, requireCertified: true });
}

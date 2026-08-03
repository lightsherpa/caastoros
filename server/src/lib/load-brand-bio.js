// Loads a brand + its currently-active BIO from Supabase.
//
// Per modes-templates-steward-plan.md rev-2 §5.5 (`loadBioForRun()`):
// specialist runs must read a CERTIFIED BIO. Until P1.5 ships the
// Steward certification flow, NO brand will have certified=true. For
// dev unblock, this loader supports a `requireCertified` flag — set
// false during P0/P1 and true once P1.5 lands.
//
// Returns { brand, bio, refusals } shaped for prompt.js consumption.

import { supabaseAdmin } from "./supabase.js";

// Pure gate: given the fetched BIO row (or null) + whether cert is required,
// return the error code to throw, or null to proceed. Extracted so it's unit-
// testable without mocking Supabase. NEVER returns a seed/fallback BIO — a
// brand's outputs must only ever read that brand's own BIO (or fail loudly).
export function bioGateCode(bioRow, requireCertified) {
  if (bioRow) return null;
  // requireCertified queries filter to certified rows, so a null row there means
  // "no certified BIO" (there may be an uncertified draft). Lenient callers get
  // BIO_NOT_READY = "no BIO at all yet; run Discovery."
  return requireCertified ? "BIO_NOT_CERTIFIED" : "BIO_NOT_READY";
}

// Brand refusals or empty — NEVER a fallback brand's refusals. Injecting a seed
// brand's refusals when a brand had none is what leaked a seed brand's DNA into every
// brand's prompt; empty is correct (prompt.js tolerates an empty array).
export function resolveRefusals(brandRefusals) {
  return Array.isArray(brandRefusals) && brandRefusals.length ? brandRefusals : [];
}

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

  // No BIO to serve → fail loudly. We do NOT fall back to a seed brand: doing so
  // leaked a seed brand's content into unrelated brands' results.
  const gateCode = bioGateCode(bioRow, requireCertified);
  if (gateCode) {
    const err = new Error(`${gateCode} for brand ${brandRow.id}`);
    err.code = gateCode;
    throw err;
  }

  /* Attribution: DB `certified_by` is a team_members FK set only on the senior
     (Steward) path; self-cert leaves it null. DB `cert_kind` is the Steward JOB
     reason, NOT a certifier type — derive the client-facing self/steward kind
     here and resolve the Steward's display name for output attribution. */
  let certifierName = null;
  let certKind = null;
  if (bioRow.certified) {
    certKind = bioRow.certified_by ? "steward" : "self";
    if (bioRow.certified_by) {
      const { data: cm } = await supabaseAdmin
        .from("team_members").select("name, first_name").eq("id", bioRow.certified_by).maybeSingle();
      certifierName = cm?.name || cm?.first_name || null;
    }
  }

  return {
    brand:    { id: brandRow.id, name: brandRow.name, url: brandRow.url, tagline: bioRow.payload?.identity?.positioning },
    bio: {
      ...bioRow.payload,
      id:           bioRow.id,
      version:      bioRow.version,
      score:        bioRow.score,
      certified:    bioRow.certified,
      certified_by: certifierName,   // resolved Steward name (senior) or null (self)
      certified_at: bioRow.certified_at,
      cert_kind:    certKind,         // client-facing: "self" | "steward" | null
    },
    refusals: resolveRefusals(brandRow.refusals),
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

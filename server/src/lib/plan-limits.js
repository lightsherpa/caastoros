// Single source of truth for per-tier brand limits.
//
// CaastorOS workspaces carry a `tier` column ∈ '00' | '01' | '02' | '03'.
// This module decides how many brands each tier may have. Pure, no I/O.

export const BRAND_LIMITS = { "00": 1, "01": 2, "02": 3, "03": Infinity };

// Unknown / missing tier falls back to the most restrictive limit (1).
export function brandLimit(tier) {
  return BRAND_LIMITS[tier] ?? BRAND_LIMITS["00"];
}

export function canAddBrand(tier, currentCount) {
  return Number(currentCount) < brandLimit(tier);
}

// Monthly credit pool per tier (the "what you can run per month" entitlement).
// 0 = unlimited (The Colony). PLACEHOLDER numbers — tune to final pricing.
export const MONTHLY_POOL = { "00": 300, "01": 800, "02": 1500, "03": 0 };
export function monthlyPool(tier) {
  return MONTHLY_POOL[tier] ?? MONTHLY_POOL["00"];
}

// Human craft (paid human polish) unlocks at The River (02) and above.
export const CRAFT_MIN_TIER = "02";
export function craftEnabled(tier) {
  return String(tier ?? "00") >= CRAFT_MIN_TIER;
}

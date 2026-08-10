/* Brand-owned writes must be explicit. Falling back to the first workspace
   brand is acceptable for a read-only empty state, never for generated work. */
export function requireBrandId(brandId) {
  const normalized = typeof brandId === "string" ? brandId.trim() : "";
  if (!normalized) {
    const err = new Error("brandId required — select a brand before creating work");
    err.code = "BRAND_REQUIRED";
    throw err;
  }
  return normalized;
}

export function resolveRunBrandId({ brandId, existingBriefBrandId = null }) {
  const requested = typeof brandId === "string" ? brandId.trim() : "";
  if (!existingBriefBrandId) return requireBrandId(requested);
  if (requested && requested !== existingBriefBrandId) {
    const err = new Error("briefId belongs to a different brand");
    err.code = "BRAND_MISMATCH";
    throw err;
  }
  return existingBriefBrandId;
}

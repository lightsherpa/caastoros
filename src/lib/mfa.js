export async function prepareTotpFactor(mfa, { friendlyName = "CaastorOS" } = {}) {
  const listed = await mfa.listFactors();
  if (listed.error) throw listed.error;
  const aggregate = Array.isArray(listed.data?.all) ? listed.data.all : [];
  const typed = Array.isArray(listed.data?.totp) ? listed.data.totp : [];
  const totp = [...new Map(
    [...aggregate.filter((factor) => factor.factor_type === "totp"), ...typed]
      .filter((factor) => factor?.id)
      .map((factor) => [factor.id, factor]),
  ).values()];
  const verified = totp.find((factor) => factor.status === "verified");
  if (verified) return { factor:verified, enrolling:false };

  // Supabase creates the factor before verification. If setup is abandoned,
  // that unverified row must be removed before the same friendly name can be
  // enrolled again; otherwise enroll() fails and the user never sees a QR.
  const stale = totp.filter((factor) =>
    factor.status !== "verified" && (!factor.friendly_name || factor.friendly_name === friendlyName),
  );
  for (const factor of stale) {
    const removed = await mfa.unenroll({ factorId:factor.id });
    if (removed.error) throw removed.error;
  }

  const enrolled = await mfa.enroll({ factorType:"totp", friendlyName });
  if (enrolled.error) throw enrolled.error;
  return { factor:enrolled.data, enrolling:true };
}

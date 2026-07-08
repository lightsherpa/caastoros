import { Resend } from "resend";

/* Transactional email via Resend. Lazy client (constructing without a key is
   fine, but we guard sends). If RESEND_API_KEY is unset the send is skipped
   with a warning so notifications degrade to in-app-only rather than erroring. */
let _resend = null;
function getResend() {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

export async function sendEmail({ to, subject, html }) {
  if (!process.env.RESEND_API_KEY) {
    console.warn("[email] RESEND_API_KEY unset — skipping notification email to", to);
    return { skipped: true };
  }
  const from = process.env.EMAIL_FROM || "CaastorOS <notifications@caastoros.com>";
  // Resend resolves { data, error } (no throw on API errors) — surface errors so
  // the Inngest function's retries:2 actually fire instead of silently dropping.
  const { data, error } = await getResend().emails.send({ from, to, subject, html });
  if (error) throw new Error(`Resend send failed: ${error.message || error}`);
  return data;
}

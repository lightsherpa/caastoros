import { inngest } from "../../lib/inngest.js";
import { supabaseAdmin } from "../../lib/supabase.js";
import { sendEmail } from "../../lib/email.js";

const esc = (s) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* Delivers a notification email. Triggered by notify() via inngest.send
   ('notification/email'). Decoupled from the request path so it never blocks
   an HTTP response or the runs SSE stream. Looks up the recipient's email. */
export const sendNotificationEmail = inngest.createFunction(
  { id: "send-notification-email", retries: 2, triggers: [{ event: "notification/email" }] },
  async ({ event }) => {
    const { recipientUserId, title, body, link } = event.data || {};
    if (!recipientUserId) return { skipped: "no recipient" };

    const { data: user } = await supabaseAdmin
      .from("users").select("email").eq("id", recipientUserId).maybeSingle();
    if (!user?.email) return { skipped: "no email on file" };

    const appUrl = (process.env.APP_URL || "").replace(/\/$/, "");
    if (link && !appUrl) console.warn("[email] APP_URL unset — notification CTA link omitted");
    // Only render the CTA for a validated relative hash route on a known origin.
    const safeLink = /^#\/[\w/-]*$/.test(String(link || "")) ? link : null;
    const cta = appUrl && safeLink
      ? `<a href="${appUrl}/${esc(safeLink)}" style="display:inline-block;background:#F8C036;color:#071437;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600">Open in CaastorOS</a>`
      : "";
    const html = `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:480px">
      <h2 style="margin:0 0 8px;color:#071437;font-size:18px">${esc(title)}</h2>
      ${body ? `<p style="margin:0 0 16px;color:#4B5675;line-height:1.5">${esc(body)}</p>` : ""}
      ${cta}
    </div>`;

    const res = await sendEmail({ to: user.email, subject: title, html });
    return { to: user.email, res };
  }
);

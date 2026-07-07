import { Hono } from "hono";
import { requireAuth } from "../middleware/auth.js";
import { supabaseAdmin } from "../lib/supabase.js";
import { getStripe, TIER_TO_PRICE, PRICE_TO_TIER, SELF_SERVE_TIERS } from "../lib/stripe.js";

const app = new Hono();
const appUrl = () => process.env.APP_URL || "http://localhost:5173";

/* POST /api/billing/checkout — start a hosted Stripe Checkout for a tier upgrade.
   Body: { tier }. Auth required; the workspace is resolved from the JWT, never
   the body. Returns { url } to redirect the browser to Stripe's hosted page. */
app.post("/checkout", requireAuth, async (c) => {
  if (!process.env.STRIPE_SECRET_KEY) return c.json({ error: "Billing not configured" }, 503);
  const { workspaceId } = c.get("auth");
  const { tier } = await c.req.json().catch(() => ({}));
  if (!SELF_SERVE_TIERS.has(tier) || !TIER_TO_PRICE[tier]) {
    return c.json({ error: "Not a self-serve tier" }, 400);
  }
  const stripe = getStripe();

  // Find-or-create the Stripe customer for this workspace (reuse existing column).
  const { data: ws } = await supabaseAdmin
    .from("workspaces").select("stripe_customer_id").eq("id", workspaceId).maybeSingle();
  let customer = ws?.stripe_customer_id;
  if (!customer) {
    const created = await stripe.customers.create({ metadata: { workspace_id: workspaceId } });
    customer = created.id;
    await supabaseAdmin.from("workspaces").update({ stripe_customer_id: customer }).eq("id", workspaceId);
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer,
    line_items: [{ price: TIER_TO_PRICE[tier], quantity: 1 }],
    client_reference_id: workspaceId,
    subscription_data: { metadata: { workspace_id: workspaceId } },
    success_url: `${appUrl()}/#/upgrade/success`,
    cancel_url: `${appUrl()}/#/upgrade/cancel`,
  });
  return c.json({ url: session.url });
});

/* POST /api/billing/webhook — Stripe signature-verified. NO requireAuth (this is
   authenticated by the signature, not a JWT). The RAW body is required for
   verification, so read arrayBuffer() and never call c.req.json() here. */
app.post("/webhook", async (c) => {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !process.env.STRIPE_SECRET_KEY) return c.json({ error: "Webhook not configured" }, 503);
  const stripe = getStripe();
  const sig = c.req.header("stripe-signature");
  let event;
  try {
    const raw = Buffer.from(await c.req.arrayBuffer());
    event = stripe.webhooks.constructEvent(raw, sig, secret);
  } catch (err) {
    return c.json({ error: `Signature verification failed: ${err.message}` }, 400);
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const workspaceId = session.client_reference_id;
      let tier = null;
      if (session.subscription) {
        const sub = await stripe.subscriptions.retrieve(session.subscription);
        tier = PRICE_TO_TIER[sub.items?.data?.[0]?.price?.id] || null;
      }
      if (workspaceId && tier) {
        // Tier is the ENTIRE upgrade effect — the monthly pool is a live cap
        // derived from tier (credits.js). Do NOT write the ledger here; that's
        // only for a separately-sold credit top-up, which the MVP has none of.
        // Idempotent: replays just re-set the same tier.
        await supabaseAdmin
          .from("workspaces")
          .update({ tier, stripe_customer_id: session.customer })
          .eq("id", workspaceId);
      }
    } else if (event.type === "customer.subscription.deleted") {
      const sub = event.data.object;
      await supabaseAdmin.from("workspaces").update({ tier: "00" }).eq("stripe_customer_id", sub.customer);
    }
  } catch (err) {
    console.error("billing webhook handler error:", err);
    return c.json({ error: "handler error" }, 500); // 500 → Stripe retries
  }
  return c.json({ received: true });
});

export default app;

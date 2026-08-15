import { Hono } from "hono";
import { requireAuth } from "../middleware/auth.js";
import { supabaseAdmin } from "../lib/supabase.js";
import { getStripe, TIER_TO_PRICE, PRICE_TO_TIER, SELF_SERVE_TIERS } from "../lib/stripe.js";

const app = new Hono();
const appUrl = () => process.env.APP_URL || "http://localhost:5173";

async function requireBillingOwner(c, next) {
  const { workspaceId, userId, role } = c.get("auth");
  if (role === "admin") return next();
  const { data: owner, error } = await supabaseAdmin
    .from("users").select("id").eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (error) return c.json({ error: "Could not resolve billing authority" }, 500);
  if (!owner || owner.id !== userId) return c.json({ error: "Workspace billing owner only" }, 403);
  await next();
}

async function syncCustomerTier(stripe, customerId, workspaceId = null) {
  const subscriptions = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 100 });
  let tier = "00";
  for (const sub of subscriptions.data) {
    if (!["active", "trialing"].includes(sub.status)) continue;
    const candidate = PRICE_TO_TIER[sub.items?.data?.[0]?.price?.id];
    if (candidate && candidate > tier) tier = candidate;
  }
  let query = supabaseAdmin.from("workspaces").update({ tier, stripe_customer_id: customerId });
  query = workspaceId ? query.eq("id", workspaceId) : query.eq("stripe_customer_id", customerId);
  const { error } = await query;
  if (error) throw new Error(`entitlement persistence failed: ${error.message}`);
  return tier;
}

/* POST /api/billing/checkout — start a hosted Stripe Checkout for a tier upgrade.
   Body: { tier }. Auth required; the workspace is resolved from the JWT, never
   the body. Returns { url } to redirect the browser to Stripe's hosted page. */
app.post("/checkout", requireAuth, requireBillingOwner, async (c) => {
  if (!process.env.STRIPE_SECRET_KEY) return c.json({ error: "Billing not configured" }, 503);
  const { workspaceId } = c.get("auth");
  const { tier } = await c.req.json().catch(() => ({}));
  if (!SELF_SERVE_TIERS.has(tier) || !TIER_TO_PRICE[tier]) {
    return c.json({ error: "Not a self-serve tier" }, 400);
  }
  const stripe = getStripe();

  // Find-or-create the Stripe customer for this workspace (reuse existing column).
  const { data: ws, error: wsErr } = await supabaseAdmin
    .from("workspaces").select("stripe_customer_id").eq("id", workspaceId).maybeSingle();
  if (wsErr || !ws) return c.json({ error: "Workspace billing record not found" }, 404);
  let customer = ws?.stripe_customer_id;
  if (!customer) {
    const created = await stripe.customers.create(
      { metadata: { workspace_id: workspaceId } },
      { idempotencyKey: `workspace-customer:${workspaceId}` },
    );
    customer = created.id;
    const { error: customerErr } = await supabaseAdmin.from("workspaces")
      .update({ stripe_customer_id: customer }).eq("id", workspaceId);
    if (customerErr) return c.json({ error: `Could not persist billing customer: ${customerErr.message}` }, 500);
  }

  const subscriptions = await stripe.subscriptions.list({ customer, status: "all", limit: 100 });
  if (subscriptions.data.some((sub) => ["active", "trialing", "past_due", "incomplete"].includes(sub.status))) {
    return c.json({ error: "Workspace already has a subscription", code: "SUBSCRIPTION_ALREADY_EXISTS" }, 409);
  }
  const openSessions = await stripe.checkout.sessions.list({ customer, status: "open", limit: 100 });
  const openSubscription = openSessions.data.find((item) => item.mode === "subscription");
  if (openSubscription) {
    if (openSubscription.metadata?.requested_tier === tier && openSubscription.url) {
      return c.json({ url: openSubscription.url, reused: true });
    }
    return c.json({ error: "A subscription checkout is already open", code: "CHECKOUT_ALREADY_OPEN" }, 409);
  }

  const sessionBucket = Math.floor(Date.now() / (5 * 60 * 1000));
  const session = await stripe.checkout.sessions.create(
    {
      mode: "subscription",
      customer,
      line_items: [{ price: TIER_TO_PRICE[tier], quantity: 1 }],
      client_reference_id: workspaceId,
      metadata: { workspace_id: workspaceId, requested_tier: tier },
      subscription_data: { metadata: { workspace_id: workspaceId } },
      success_url: `${appUrl()}/#/upgrade/success`,
      cancel_url: `${appUrl()}/#/upgrade/cancel`,
    },
    { idempotencyKey: `checkout:${workspaceId}:${tier}:${sessionBucket}` },
  );
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
    const { data: claim, error: claimErr } = await supabaseAdmin.rpc("claim_billing_event", {
      p_id: event.id,
      p_type: event.type,
      p_payload: event.data.object,
    });
    if (claimErr) throw new Error(`billing event claim failed: ${claimErr.message}`);
    if (!claim?.claimed) {
      if (!claim?.processed) {
        return c.json({ error: "billing event is already processing" }, 409);
      }
      return c.json({
        received: true,
        duplicate: true,
      });
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const workspaceId = session.client_reference_id;
      if (!workspaceId || !session.customer) throw new Error("checkout session missing workspace/customer");
      if (session.subscription) {
        const sub = await stripe.subscriptions.retrieve(session.subscription);
        if (!PRICE_TO_TIER[sub.items?.data?.[0]?.price?.id]) throw new Error("unresolved price→tier");
      }
      await syncCustomerTier(stripe, session.customer, workspaceId);
    } else if (["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"].includes(event.type)) {
      const sub = event.data.object;
      const workspaceId = sub.metadata?.workspace_id;
      await syncCustomerTier(stripe, sub.customer, workspaceId || null);
    }
    const { error: markErr } = await supabaseAdmin.from("billing_events")
      .update({ processed_at: new Date().toISOString() }).eq("id", event.id);
    if (markErr) throw new Error(`billing event completion failed: ${markErr.message}`);
  } catch (err) {
    console.error("billing webhook handler error:", err);
    return c.json({ error: "handler error" }, 500); // 500 → Stripe retries
  }
  return c.json({ received: true });
});

export default app;

import Stripe from "stripe";

/* Stripe client + tier↔price maps. Server-side ONLY — these env vars must never
   reach the browser (no VITE_ prefix). Prices are created in the Stripe
   dashboard; only the two self-serve tiers have prices. 00 Creek is the free
   floor; 03 Colony is "talk to us" (no self-serve checkout).

   The client is LAZY: `new Stripe("")` throws, so we only construct it when a
   key is present. This lets the server boot with billing unconfigured — the
   routes 503-guard before calling getStripe(). */
let _stripe = null;
export function getStripe() {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY not set");
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return _stripe;
}

export const TIER_TO_PRICE = {
  "01": process.env.STRIPE_PRICE_DAM,
  "02": process.env.STRIPE_PRICE_RIVER,
};

export const PRICE_TO_TIER = Object.fromEntries(
  Object.entries(TIER_TO_PRICE)
    .filter(([, price]) => Boolean(price))
    .map(([tier, price]) => [price, tier]),
);

export const SELF_SERVE_TIERS = new Set(["01", "02"]);

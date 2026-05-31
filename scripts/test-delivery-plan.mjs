// scripts/test-delivery-plan.mjs
// Live smoke for the Delivery Plan contract. Signs in, POSTs a social brief
// to /api/briefs/sharpen, and asserts the returned plan includes a visual
// part and at least one platform. Mirrors scripts/test-run.mjs conventions.
//
// Run:
//   EMAIL=... PASSWORD=... npm run test:plan

import { createClient } from "@supabase/supabase-js";

const EMAIL    = process.env.EMAIL;
const PASSWORD = process.env.PASSWORD;
const API_BASE = process.env.API_BASE || "http://localhost:8787";
const BRIEF    = process.env.BRIEF || "A week of Instagram and LinkedIn content for the spring drop.";

if (!EMAIL || !PASSWORD) {
  console.error("Usage: EMAIL=... PASSWORD=... [BRIEF='...'] npm run test:plan");
  process.exit(1);
}

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const { data: auth, error: authErr } = await sb.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
if (authErr) { console.error("Sign-in failed:", authErr.message); process.exit(1); }
const jwt = auth.session.access_token;

const res = await fetch(`${API_BASE}/api/briefs/sharpen`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
  body: JSON.stringify({ briefText: BRIEF }),
});
const json = await res.json();
if (!res.ok) { console.error("Sharpen failed:", json.error || res.status); process.exit(1); }

const groups = json.deliveryPlan?.deliverableGroups || [];
console.log("Title:    ", json.title);
console.log("Plan:     ", JSON.stringify(groups, null, 2));
console.log("Derived:  ", json.proposedSpecialists);

const VISUAL = new Set(["a19","a20","a21","a22","a35","a41","a42","a43","a44","a45","a46"]);
const hasGroups   = groups.length > 0;
const hasVisual   = groups.some((g) => Object.values(g.crew || {}).some((id) => VISUAL.has(id)));
const hasPlatform = groups.every((g) => Array.isArray(g.platforms) && g.platforms.length > 0);

console.log("\nChecks:");
console.log("  has groups:   ", hasGroups);
console.log("  has visual:   ", hasVisual, "(social brief MUST propose a visual specialist)");
console.log("  has platforms:", hasPlatform);

if (hasGroups && hasVisual && hasPlatform) { console.log("\n✅ Delivery Plan contract OK"); process.exit(0); }
console.error("\n❌ Delivery Plan contract FAILED"); process.exit(1);

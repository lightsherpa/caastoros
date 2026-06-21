// End-to-end test for P3 — fires a real specialist run via the API
// route as if it were the SPA. Signs in as an existing user, finds the
// active spec, POSTs to /api/runs/stream, parses the SSE.
//
// Run:
//   EMAIL=oscar+25may@lamesa.co PASSWORD=Caastor2026! SPECIALIST=a12 BRIEF="Pricing relaunch hero — annual subscription, one line." npm run test:run

import { createClient } from "@supabase/supabase-js";

const SPECIALIST = process.env.SPECIALIST || "a12";
const BRIEF      = process.env.BRIEF || "A one-line pricing-page hero for the annual subscription. Editorial, no fake urgency.";
const EMAIL      = process.env.EMAIL;
const PASSWORD   = process.env.PASSWORD;
const API_BASE   = process.env.API_BASE || "http://localhost:8787";

if (!EMAIL || !PASSWORD) {
  console.error("Usage: EMAIL=... PASSWORD=... [SPECIALIST=a12] [BRIEF='...'] npm run test:run");
  process.exit(1);
}

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const { data: auth, error: authErr } = await sb.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
if (authErr) { console.error("Sign-in failed:", authErr.message); process.exit(1); }
const jwt = auth.session.access_token;
console.log(`Signed in: ${EMAIL}`);
console.log(`Specialist: ${SPECIALIST}`);
console.log(`Brief: ${BRIEF}\n`);
console.log("─── Streaming ─────────────────────────────────────────────\n");

const res = await fetch(`${API_BASE}/api/runs/stream`, {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${jwt}`,
    "Content-Type":  "application/json",
  },
  body: JSON.stringify({ specialistId: SPECIALIST, briefText: BRIEF }),
});
if (!res.ok) {
  const t = await res.text();
  console.error(`HTTP ${res.status}: ${t}`);
  process.exit(1);
}

const reader = res.body.getReader();
const decoder = new TextDecoder();
let buf = "";
let qa = null;
let done = null;

while (true) {
  const { value, done: streamDone } = await reader.read();
  if (streamDone) break;
  buf += decoder.decode(value, { stream: true });
  const events = buf.split("\n\n");
  buf = events.pop() || "";
  for (const ev of events) {
    const lines = ev.split("\n");
    const eventLine = lines.find((l) => l.startsWith("event:"));
    const dataLine  = lines.find((l) => l.startsWith("data:"));
    if (!dataLine) continue;
    const eventType = eventLine?.slice(6).trim();
    const data = JSON.parse(dataLine.slice(5).trim());
    if (eventType === "token") {
      process.stdout.write(data.text);
    } else if (eventType === "qa") {
      qa = data;
    } else if (eventType === "done") {
      done = data;
    } else if (eventType === "error") {
      console.error(`\n\nERROR: ${data.message}`);
      process.exit(1);
    }
  }
}

console.log("\n\n─── Done ──────────────────────────────────────────────────\n");
console.log("QA verdict:");
console.log(`  passed:      ${qa?.passed}`);
console.log(`  voice_match: ${qa?.voice_match}/100`);
console.log(`  violations:  ${qa?.violations?.length ? qa.violations.join(" · ") : "(none)"}`);
console.log("");
console.log(`Run id:     ${done?.runId}`);
console.log(`Output id:  ${done?.outputId}`);
console.log(`Model:      ${done?.usage?.model} (via ${done?.usage?.provider})`);
console.log(`Tokens:     ${done?.usage?.prompt_tokens} in / ${done?.usage?.completion_tokens} out (cached ${done?.usage?.cached_tokens || 0})`);
const totalCost = done?.usage?.total_cost_usd;
const qaCost = done?.usage?.qa_cost_usd;
console.log(`Cost:       $${(totalCost ?? 0).toFixed(6)}  (QA: $${(qaCost ?? 0).toFixed(6)})`);
console.log(`Credits:    ${done?.credits_debited} cr`);
console.log(`BIO:        v${done?.brand?.bioVersion}${done?.brand?.certifiedBy ? " · certified" : " · uncertified"}`);

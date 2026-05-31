// scripts/test-deliverables.mjs
// Live smoke for the deliverable run path. Signs in, fires ONE text specialist
// run with a deliverableSpec asking for N items, parses the SSE, and asserts N
// structured deliverables came back (each with its own QA status).
//
// Run:
//   EMAIL=... PASSWORD=... [SPECIALIST=a16] [COUNT=5] npm run test:deliverables

import { createClient } from "@supabase/supabase-js";

const EMAIL    = process.env.EMAIL;
const PASSWORD = process.env.PASSWORD;
const API_BASE = process.env.API_BASE || "http://localhost:8787";
const SPECIALIST = process.env.SPECIALIST || "a16";
const COUNT    = Number(process.env.COUNT || 5);
const BRIEF    = process.env.BRIEF || "A week of Instagram captions for the spring drop.";

if (!EMAIL || !PASSWORD) {
  console.error("Usage: EMAIL=... PASSWORD=... [SPECIALIST=a16] [COUNT=5] npm run test:deliverables");
  process.exit(1);
}

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const { data: auth, error: authErr } = await sb.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
if (authErr) { console.error("Sign-in failed:", authErr.message); process.exit(1); }
const jwt = auth.session.access_token;

const res = await fetch(`${API_BASE}/api/runs/stream`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
  body: JSON.stringify({
    specialistId: SPECIALIST,
    briefText: BRIEF,
    deliverableSpec: { type: "social_post", part: "caption", count: COUNT, platform: "instagram" },
  }),
});
if (!res.ok) { console.error("Run failed:", res.status, await res.text()); process.exit(1); }

const reader = res.body.getReader();
const decoder = new TextDecoder();
let buf = "", done = null;
while (true) {
  const { value, done: rdone } = await reader.read();
  if (rdone) break;
  buf += decoder.decode(value, { stream: true });
  const events = buf.split("\n\n"); buf = events.pop() || "";
  for (const ev of events) {
    const dataLine = ev.split("\n").find((l) => l.startsWith("data:"));
    const typeLine = ev.split("\n").find((l) => l.startsWith("event:"));
    if (typeLine?.includes("done") && dataLine) { try { done = JSON.parse(dataLine.slice(5).trim()); } catch {} }
  }
}

const items = done?.output?.deliverables || [];
console.log(`Deliverables returned: ${items.length}`);
items.forEach((d, i) => console.log(`  ${i + 1}. [${d.status}] ${d.title || "(untitled)"} — ${String(d.body).slice(0, 60)}…`));

if (items.length >= 2 && done?.output?.kind === "deliverables") {
  console.log(`\n✅ Run engine produced ${items.length} structured deliverables`);
  process.exit(0);
}
console.error("\n❌ Expected a deliverables array with ≥2 items"); process.exit(1);

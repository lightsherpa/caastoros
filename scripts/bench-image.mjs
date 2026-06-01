// Offline image benchmark — Flux 1.1 Pro vs GPT Image 2 on the same prompt.
// Uses the brand BIO currently in the DB (first brand). Saves images +
// a results.md to docs/benchmarks/<date>/. Live routing is NOT touched.
//
// Run:  node --env-file=server/.env scripts/bench-image.mjs
import { createClient } from "@supabase/supabase-js";
import { writeFileSync, mkdirSync } from "node:fs";
import { generate } from "../server/src/lib/models/fal-image.js";
import { composeImagePrompt } from "../server/src/lib/compose-image-prompt.js";

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY"); process.exit(1);
}
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// First brand + its latest BIO.
const { data: brand } = await sb.from("brands").select("id, name")
  .order("created_at", { ascending: true }).limit(1).maybeSingle();
if (!brand) { console.error("No brand in DB."); process.exit(1); }
const { data: bioRow } = await sb.from("bios").select("payload, version")
  .eq("brand_id", brand.id).order("version", { ascending: false }).limit(1).maybeSingle();
if (!bioRow) { console.error("No BIO for brand."); process.exit(1); }
const bio = bioRow.payload;

const SLOTS = [
  { slot: "hero-kv",        brief: "Hero key visual for the brand's flagship campaign.", role: "A premium hero key visual." },
  { slot: "editorial",      brief: "Editorial image for a long-form brand story.",       role: "An editorial, magazine-grade image." },
  { slot: "ad-creative",    brief: "Paid social ad creative, full-bleed photograph.",    role: "A paid-social ad background, clear hero hierarchy, no text." },
  { slot: "moodboard-tile", brief: "Mood board tile: texture & material close-up.",      role: "A cohesive mood-board imagery tile, on-palette, no text." },
];
// Schnell is the current production baseline for ad-creative + mood-board tiles;
// include it so the user compares it against Pro and gpt-image-2 on the same prompt.
const MODELS = ["vendor/fal/flux-schnell", "vendor/fal/flux-1.1-pro", "vendor/fal/gpt-image-2"];

const DATE = process.env.BENCH_DATE || "bench";        // pass BENCH_DATE=2026-06-02 for a dated folder
const outDir = `docs/benchmarks/${DATE}`;
mkdirSync(outDir, { recursive: true });
const lines = [`# Image benchmark — brand: ${brand.name} (BIO v${bioRow.version})`, ""];

for (const { slot, brief, role } of SLOTS) {
  const prompt = composeImagePrompt({ spec: { payload: { role } }, brand, bio, refusals: [], brief });
  for (const route of MODELS) {
    const tag = route.split("/").pop();
    process.stdout.write(`Generating ${slot} · ${tag}… `);
    let done = null, err = null;
    for await (const ev of generate({ route, prompt, size: "landscape_16_9" })) {
      if (ev.type === "done") done = ev;
      if (ev.type === "error") err = ev.message;
    }
    if (err) { console.log(`ERROR: ${err}`); lines.push(`- ${slot} · ${tag}: ERROR ${err}`); continue; }
    const res = await fetch(done.asset_url);
    const buf = Buffer.from(await res.arrayBuffer());
    const file = `${slot}-${tag}.png`;
    writeFileSync(`${outDir}/${file}`, buf);
    console.log(`saved ${file} ($~${done.cost_usd})`);
    lines.push(`- ${slot} · ${tag}: ![${file}](./${file}) — est $${done.cost_usd}`);
  }
  lines.push("");
}
writeFileSync(`${outDir}/results.md`, lines.join("\n") + `\n\n## Prompt basis\nSame composed prompt per slot across both models.\n`);
console.log(`\nDone → ${outDir}/results.md`);

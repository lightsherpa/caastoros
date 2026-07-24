// ─────────────────────────────────────────────────────────────────────
// Router smoke test — exercises both vendor paths through the same
// streamCompletion() entry point. Used to validate that:
//   • Anthropic path streams tokens + emits normalized usage block
//   • OpenRouter path streams tokens + emits normalized usage block
//   • Both produce the same event shape ({type, text|usage|message})
//
// Run:  npm run test:router
// ─────────────────────────────────────────────────────────────────────

import { streamCompletion } from "../server/src/lib/models/router.js";

async function run(spec, label, maxTokens = 32) {
  console.log(`\n=== ${label} ===`);
  console.log(`  route:  ${spec.payload.modelRouting.primary}`);
  process.stdout.write("  tokens: ");
  let usage = null;
  let errored = false;
  let started = Date.now();
  for await (const ev of streamCompletion({
    spec,
    system: "You are a one-word answer machine. Reply in lowercase. One word only.",
    messages: [{ role: "user", content: "Name a color." }],
    maxTokens,
  })) {
    if (ev.type === "token") process.stdout.write(ev.text);
    else if (ev.type === "done") usage = ev.usage;
    else if (ev.type === "error") { console.log(`\n  ERROR: ${ev.message}`); errored = true; }
  }
  if (errored) return;
  const ms = Date.now() - started;
  console.log(`\n  latency: ${ms}ms`);
  console.log(`  usage:  `, usage);
}

await run({
  payload: {
    modelRouting: { primary: "anthropic/claude-haiku-4-5-20251001", fallback: null, reason: "test" },
    cr_estimate: 1,
  }
}, "Anthropic path (Haiku — cheapest)");

await run({
  payload: {
    modelRouting: { primary: "openrouter/google/gemini-3.5-flash-lite", fallback: null, reason: "test" },
    cr_estimate: 1,
  }
}, "OpenRouter path (Gemini 3.5 Flash-Lite)");

await run({
  payload: {
    modelRouting: { primary: "openrouter/google/gemini-3.6-flash", fallback: null, reason: "test" },
    cr_estimate: 1,
  }
}, "OpenRouter path (Gemini 3.6 Flash)", 256);

await run({
  payload: {
    modelRouting: { primary: "openrouter/openai/gpt-5", fallback: null, reason: "test" },
    cr_estimate: 1,
  }
}, "OpenRouter path (GPT-5)", 256);

console.log("\nDone.");

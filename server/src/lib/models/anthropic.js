// ─────────────────────────────────────────────────────────────────────
// Anthropic — direct SDK adapter for the model router.
//
// Why direct: Anthropic's 5-minute prompt-cache TTL is the single
// biggest cost lever in the system (apis-and-agents-plan.md §7).
// Routing Claude calls through OpenRouter (or any proxy) makes
// cache_control flaky — we don't risk it. Other text models go via
// the OpenRouter adapter; Claude stays native.
//
// Surface: async generator yielding normalized events shared with
// openrouter.js so the router can dispatch by prefix without caring
// about provider internals.
//   { type: "token", text }
//   { type: "done",  stopReason, usage }
//   { type: "error", message }
// ─────────────────────────────────────────────────────────────────────

import Anthropic from "@anthropic-ai/sdk";

const client = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

export function hasKey() {
  return Boolean(client);
}

/**
 * Stream a completion from Anthropic.
 *
 * @param {object} params
 * @param {string} params.model         - Anthropic model id (e.g. "claude-sonnet-4-6")
 * @param {Array|string} params.system  - System prompt — either a string (one block, uncached) or
 *                                         an array of content blocks with optional `cache_control`.
 *                                         Per prompt.js, we use the array form to cache PLATFORM + BIO.
 * @param {Array} params.messages       - [{ role, content }, ...]
 * @param {number} [params.maxTokens]   - max output tokens; derived from spec.cr if omitted
 * @yields {object} normalized event
 */
export async function* streamCompletion({ model, system, messages, maxTokens = 800 }) {
  if (!client) {
    yield { type: "error", message: "Server has no ANTHROPIC_API_KEY configured." };
    return;
  }

  let stopReason = null;
  let usage = null;
  try {
    const run = client.messages.stream({
      model,
      max_tokens: maxTokens,
      system,                  // SDK accepts string OR array-of-blocks; cache_control passes through
      messages: messages.map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: String(m.content ?? ""),
      })),
    });

    for await (const ev of run) {
      if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") {
        yield { type: "token", text: ev.delta.text };
      } else if (ev.type === "message_delta") {
        if (ev.delta?.stop_reason) stopReason = ev.delta.stop_reason;
        if (ev.usage) usage = ev.usage;
      }
    }

    const final = await run.finalMessage();
    const finalUsage = usage || final.usage || {};
    // Normalize: expose cache hit/miss tokens as first-class so the router
    // can write them to runs.cached_tokens + runs.prompt_tokens without
    // each caller knowing the Anthropic-specific field names.
    yield {
      type: "done",
      stopReason: stopReason || final.stop_reason,
      usage: {
        prompt_tokens:     finalUsage.input_tokens ?? 0,
        completion_tokens: finalUsage.output_tokens ?? 0,
        cached_tokens:     finalUsage.cache_read_input_tokens ?? 0,
        cache_creation_tokens: finalUsage.cache_creation_input_tokens ?? 0,
        provider: "anthropic",
        model,
      },
    };
  } catch (err) {
    yield { type: "error", message: err?.message || String(err) };
  }
}

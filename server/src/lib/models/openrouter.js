// ─────────────────────────────────────────────────────────────────────
// OpenRouter — non-Claude text models adapter for the model router.
//
// Used for: GPT-5 (a12 Conversion Copy), Gemini Flash (a14 Subject
// Lines), and any future non-Claude text specialist. NOT used for
// Claude — see anthropic.js for why (prompt caching).
//
// API: OpenAI-compatible REST at https://openrouter.ai/api/v1/chat/completions
// with `stream: true` → SSE. No SDK; raw fetch keeps the dependency
// surface tiny and lets us add OpenRouter-specific routing modifiers
// (`:floor`, `:nitro`, provider preferences) as plain query strings.
//
// Surface mirrors anthropic.js — same normalized events so the router
// dispatches by prefix without caring about provider internals.
// ─────────────────────────────────────────────────────────────────────

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export function hasKey() {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

/**
 * Flatten an Anthropic-style system array into a single string for
 * the OpenAI-compatible chat API. cache_control markers are stripped —
 * caching outside Anthropic is provider-specific and we don't rely
 * on it here.
 */
function flattenSystem(system) {
  if (typeof system === "string") return system;
  if (Array.isArray(system)) {
    return system.map((block) => (typeof block === "string" ? block : (block?.text ?? ""))).filter(Boolean).join("\n\n");
  }
  return "";
}

/**
 * Stream a completion from OpenRouter.
 *
 * @param {object} params
 * @param {string} params.model        - OpenRouter model id, e.g. "openai/gpt-5",
 *                                        "google/gemini-2.5-flash", or with modifier
 *                                        "google/gemini-2.5-flash:floor" (cheapest provider).
 * @param {Array|string} params.system - Anthropic-style array OR plain string; flattened on send.
 * @param {Array} params.messages      - [{ role, content }, ...]
 * @param {number} [params.maxTokens]  - max output tokens
 * @yields {object} normalized event
 */
export async function* streamCompletion({ model, system, messages, maxTokens = 800 }) {
  if (!hasKey()) {
    yield { type: "error", message: "Server has no OPENROUTER_API_KEY configured." };
    return;
  }

  const systemText = flattenSystem(system);
  const body = {
    model,
    max_tokens: maxTokens,
    stream: true,
    messages: [
      ...(systemText ? [{ role: "system", content: systemText }] : []),
      ...messages.map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        /* Arrays pass through as multimodal content blocks (e.g.
           [{type:"text",...},{type:"image_url",...}] for vision QA);
           strings get the legacy coerce path. */
        content: Array.isArray(m.content) ? m.content : String(m.content ?? ""),
      })),
    ],
    // usage stats include per-token cost — let downstream cost ledger reconcile
    usage: { include: true },
  };

  let res;
  try {
    res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type":  "application/json",
        // OpenRouter ranking attribution — see https://openrouter.ai/docs/api-reference/overview#headers
        "HTTP-Referer":  process.env.OPENROUTER_REFERER || "https://caastor.local",
        "X-Title":       "CaastorOS",
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    yield { type: "error", message: `OpenRouter network error: ${err?.message || err}` };
    return;
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    yield { type: "error", message: `OpenRouter HTTP ${res.status}: ${text.slice(0, 400)}` };
    return;
  }

  // Parse SSE: each event is `data: {json}\n\n`. We accumulate partial
  // lines, split on \n, and parse JSON payloads. Final `data: [DONE]`
  // marks completion. Usage arrives on the LAST data event before [DONE]
  // when `usage.include: true` is set.
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalUsage = null;
  let finishReason = null;
  let providerLabel = null;
  let yieldedDone = false;

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Split on newlines; keep last (possibly partial) chunk in buffer
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line || !line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (payload === "[DONE]") {
          yield {
            type: "done",
            stopReason: finishReason || "stop",
            usage: {
              prompt_tokens:     finalUsage?.prompt_tokens ?? 0,
              completion_tokens: finalUsage?.completion_tokens ?? 0,
              cached_tokens:     finalUsage?.prompt_tokens_details?.cached_tokens ?? 0,
              cache_creation_tokens: 0,                            // OpenRouter doesn't surface this; Anthropic-via-OR may, but flaky
              provider: providerLabel || "openrouter",
              model,
              cost_usd: finalUsage?.cost ?? null,                  // OpenRouter exposes per-call cost
            },
          };
          yieldedDone = true;
          return;
        }
        let evt;
        try { evt = JSON.parse(payload); } catch { continue; }

        if (evt.provider) providerLabel = evt.provider;
        if (evt.usage) finalUsage = evt.usage;

        const choice = evt.choices?.[0];
        if (!choice) continue;
        if (choice.finish_reason) finishReason = choice.finish_reason;
        const delta = choice.delta?.content;
        if (typeof delta === "string" && delta.length > 0) {
          yield { type: "token", text: delta };
        }
      }
    }

    if (!yieldedDone) {
      // Stream ended without [DONE] (rare; some providers omit it)
      yield {
        type: "done",
        stopReason: finishReason || "stop",
        usage: {
          prompt_tokens:     finalUsage?.prompt_tokens ?? 0,
          completion_tokens: finalUsage?.completion_tokens ?? 0,
          cached_tokens:     finalUsage?.prompt_tokens_details?.cached_tokens ?? 0,
          cache_creation_tokens: 0,
          provider: providerLabel || "openrouter",
          model,
          cost_usd: finalUsage?.cost ?? null,
        },
      };
    }
  } catch (err) {
    yield { type: "error", message: `OpenRouter stream error: ${err?.message || err}` };
  }
}

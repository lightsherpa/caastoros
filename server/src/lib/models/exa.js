// ─────────────────────────────────────────────────────────────────────
// Exa — web research adapter for the model router.
//
// Used for: a-Site Scanner, a-Competitor Map (Research & Ops). Exa is a
// search API, not a chat model, so it doesn't stream tokens — it runs one
// search and returns the findings. To flow through the same router/runs.js
// TEXT path with zero surgery, streamCompletion() yields the formatted
// results as a single token block, then a done event.
//   POST https://api.exa.ai/search  ·  header x-api-key: $EXA_API_KEY
//
// Cost: Exa returns `costDollars.total` per request → surfaced as
// usage.cost_usd so reconcileRunCost prices it from the vendor's own cost
// (no pricing-table row needed; token/image rates don't apply to search).
// ─────────────────────────────────────────────────────────────────────

const EXA_URL = "https://api.exa.ai/search";
const NUM_RESULTS = 8;

export function hasKey() {
  return Boolean(process.env.EXA_API_KEY);
}

/** Pure: the search query is the last user message (the sharpened brief). */
export function extractQuery(messages) {
  if (!Array.isArray(messages)) return "";
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m && m.role !== "assistant") {
      return Array.isArray(m.content)
        ? m.content.map((b) => (typeof b === "string" ? b : b?.text ?? "")).join(" ").trim()
        : String(m.content ?? "").trim();
    }
  }
  return "";
}

/** Pure: render Exa results as a markdown research brief. */
export function formatResults(data, query) {
  const results = Array.isArray(data?.results) ? data.results : [];
  if (!results.length) return `No web results found for: ${query || "(empty query)"}.`;
  const lines = [`Web research — ${results.length} sources (Exa) for: ${query}`, ""];
  results.forEach((r, i) => {
    const body = (r.summary || r.text || "").replace(/\s+/g, " ").trim().slice(0, 600);
    lines.push(`${i + 1}. ${r.title || "(untitled)"} — ${r.url || ""}`);
    if (r.publishedDate) lines.push(`   published: ${r.publishedDate}`);
    if (body) lines.push(`   ${body}`);
    lines.push("");
  });
  return lines.join("\n");
}

/**
 * Same surface as the other adapters. Ignores `system`/`maxTokens` — Exa
 * only needs the query (from `messages`).
 * @yields normalized event { type:"token"|"done"|"error", ... }
 */
export async function* streamCompletion({ model = "vendor/exa/search", messages }) {
  if (!hasKey()) {
    yield { type: "error", message: "Server has no EXA_API_KEY configured." };
    return;
  }
  const query = extractQuery(messages);
  if (!query) { yield { type: "error", message: "Exa: no query in the brief." }; return; }

  let res;
  try {
    res = await fetch(EXA_URL, {
      method: "POST",
      headers: { "x-api-key": process.env.EXA_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        type: "auto",
        numResults: NUM_RESULTS,
        contents: { text: { maxCharacters: 1200 }, summary: true },
      }),
    });
  } catch (err) {
    yield { type: "error", message: `Exa network error: ${err?.message || err}` };
    return;
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    yield { type: "error", message: `Exa HTTP ${res.status}: ${text.slice(0, 400)}` };
    return;
  }

  let data;
  try { data = await res.json(); } catch (err) {
    yield { type: "error", message: `Exa: bad JSON response: ${err?.message || err}` };
    return;
  }

  yield { type: "token", text: formatResults(data, query) };
  yield {
    type: "done",
    stopReason: "stop",
    usage: {
      prompt_tokens: 0, completion_tokens: 0, cached_tokens: 0, cache_creation_tokens: 0,
      provider: "exa",
      model,
      cost_usd: data?.costDollars?.total ?? null,   // Exa's own reported cost → reconciled directly
    },
  };
}

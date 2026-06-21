// ─────────────────────────────────────────────────────────────────────
// Model router — single entry point for every text completion.
//
// Reads spec.payload.modelRouting.primary (a vendor-prefixed model id)
// and dispatches to the right adapter. Spec-driven routing means
// flipping a specialist from Sonnet → GPT-5 is a single SQL update
// to specs.payload — no code change anywhere downstream.
//
// Routing convention (matches scripts/seed-specs.mjs MODEL_MAP):
//   anthropic/<model>    → direct Anthropic SDK, preserves cache_control
//   openrouter/<model>   → OpenRouter HTTP, normalized SSE
//   vendor/<short_key>   → non-text vendors (image/web/deck/search/audio);
//                           text router rejects, image/web routers handle in later phases.
//
// All adapters yield the same normalized event shape so SSE forwarding
// in routes/ doesn't need vendor-aware code:
//   { type: "token", text }
//   { type: "done",  stopReason, usage:{prompt_tokens, completion_tokens, cached_tokens, cache_creation_tokens, provider, model, cost_usd?} }
//   { type: "error", message }
// ─────────────────────────────────────────────────────────────────────

import * as anthropic from "./anthropic.js";
import * as openrouter from "./openrouter.js";

/**
 * Stream a text completion through the right vendor.
 *
 * @param {object} params
 * @param {object} params.spec           - DB row from `specs` table; reads spec.payload.modelRouting.primary
 *                                          (e.g. "anthropic/claude-sonnet-4-6", "openrouter/openai/gpt-5").
 *                                          For the L1 Brandolph caller (no DB spec), pass a synthetic
 *                                          object: { payload: { modelRouting: { primary: "anthropic/claude-sonnet-4-6" } } }.
 * @param {Array|string} params.system   - System prompt (array form preserves cache_control for Anthropic).
 * @param {Array} params.messages        - [{ role, content }, ...]
 * @param {number} [params.maxTokens]    - max output tokens; derived from spec.payload.cr_estimate if omitted
 * @yields {object} normalized event
 */
export async function* streamCompletion({ spec, system, messages, maxTokens }) {
  const route = spec?.payload?.modelRouting?.primary;
  if (typeof route !== "string" || !route.includes("/")) {
    yield { type: "error", message: `Invalid model route: ${JSON.stringify(route)}. Expected "anthropic/<model>" or "openrouter/<model>".` };
    return;
  }

  // Derive a token budget from the credit estimate if caller didn't supply one.
  // Rough conversion: 1 cr ≈ 100 output tokens (tunable later from real costs).
  // Hard floor of 16 defends against provider-specific minimums — notably GPT-5
  // rejects max_tokens<16. Caller-supplied values are also floored to keep the
  // contract uniform across vendors.
  const requested = maxTokens ?? Math.max(200, Math.min(4000, (spec?.payload?.cr_estimate ?? 8) * 100));
  const budget = Math.max(16, requested);

  if (route.startsWith("anthropic/")) {
    const model = route.slice("anthropic/".length);
    yield* anthropic.streamCompletion({ model, system, messages, maxTokens: budget });
    return;
  }

  if (route.startsWith("openrouter/")) {
    const model = route.slice("openrouter/".length);
    yield* openrouter.streamCompletion({ model, system, messages, maxTokens: budget });
    return;
  }

  if (route.startsWith("vendor/")) {
    yield { type: "error", message: `Non-text vendor route "${route}" — use image/web/search modules, not the text router.` };
    return;
  }

  yield { type: "error", message: `Unknown route prefix: ${route}` };
}

/**
 * Synthetic spec for the L1 Brandolph caller (no DB row yet).
 * Brandolph routes on Sonnet per apis-and-agents-plan.md §4.1.
 * Used by routes/brandolph.js until P1 wires real spec loading.
 */
export const BRANDOLPH_SYNTHETIC_SPEC = {
  payload: {
    name: "Brandolph",
    modelRouting: { primary: "anthropic/claude-sonnet-4-6", fallback: null, reason: "L1 orchestrator (synthetic spec)" },
    cr_estimate: 8,
  },
};

/**
 * Inspect whether a route is currently available (key present).
 * Useful for /health checks and pre-flight validation in routes/.
 */
export function isRouteAvailable(route) {
  if (typeof route !== "string") return false;
  if (route.startsWith("anthropic/")) return anthropic.hasKey();
  if (route.startsWith("openrouter/")) return openrouter.hasKey();
  return false;
}

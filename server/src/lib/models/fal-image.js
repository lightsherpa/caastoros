// ─────────────────────────────────────────────────────────────────────
// fal.ai — image generation adapter.
//
// fal is the "OpenRouter of images": one account, one key, many models
// (Flux 1.1 Pro / Flux schnell / Recraft / SDXL / Ideogram). Image
// runs DON'T stream tokens — they queue a job, take 5–30s, and return
// a single asset URL.
//
// Cost-optimization (per memory):
//   Flux 1.1 Pro  → ~$0.04/image  · top-tier · a20 Hero KV, a21 Editorial
//   Flux schnell  → ~$0.003/image · drafts/iteration · 13× cheaper
//   Recraft V3    → ~$0.03/image  · vector/logo · a19 Identity Drafts
//
// Adapter exposes generate() with normalized callbacks (onProgress,
// onDone, onError) so the runs route can emit unified SSE events.
// ─────────────────────────────────────────────────────────────────────

const QUEUE_BASE = "https://queue.fal.run";

/* Map our spec route → fal endpoint + payload shape. Each entry knows
   the model's quirks (image_size param, num_inference_steps, etc.). */
export const FAL_ROUTES = {
  "vendor/fal/flux-1.1-pro": {
    endpoint: "/fal-ai/flux-pro/v1.1",
    payload: ({ prompt, size = "landscape_16_9" }) => ({
      prompt,
      image_size: size,
      num_inference_steps: 28,
      guidance_scale: 3.5,
      enable_safety_checker: true,
    }),
    cost_estimate_usd: 0.04,
  },
  "vendor/fal/flux-schnell": {
    endpoint: "/fal-ai/flux/schnell",
    payload: ({ prompt, size = "landscape_16_9" }) => ({
      prompt,
      image_size: size,
      num_inference_steps: 4,
      enable_safety_checker: true,
    }),
    cost_estimate_usd: 0.003,
  },
  "vendor/fal/recraft-v3": {
    endpoint: "/fal-ai/recraft-v3",
    payload: ({ prompt, size = "square_hd" }) => ({
      prompt,
      image_size: size,
      style: "digital_illustration",
    }),
    cost_estimate_usd: 0.03,
  },
  "vendor/fal/gpt-image-2": {
    endpoint: "/openai/gpt-image-2",
    payload: ({ prompt, size = "landscape_16_9" }) => ({
      prompt,
      image_size: size,
      quality: "high",
      num_images: 1,
      output_format: "png",
    }),
    cost_estimate_usd: 0.07,   // token-priced model; placeholder until real numbers land
  },
};

export function hasKey() {
  return Boolean(process.env.FAL_API_KEY);
}

export function isImageRoute(route) {
  return typeof route === "string" && route.startsWith("vendor/fal/");
}

/**
 * Generate an image via fal.ai. Async generator yielding normalized events:
 *   { type: "progress", stage, pct }   while waiting / polling
 *   { type: "done", asset_url, model, cost_usd, seed, dimensions }
 *   { type: "error", message }
 *
 * @param {object} args
 * @param {string} args.route   - "vendor/fal/flux-1.1-pro" etc.
 * @param {string} args.prompt  - composed prompt (BIO + brief + spec method)
 * @param {string} [args.size]  - "square_hd" | "landscape_16_9" | "portrait_4_3" | ...
 */
export async function* generate({ route, prompt, size }) {
  const key = process.env.FAL_API_KEY;
  if (!key) { yield { type: "error", message: "FAL_API_KEY not set" }; return; }
  const cfg = FAL_ROUTES[route];
  if (!cfg)  { yield { type: "error", message: `Unknown fal route: ${route}` }; return; }

  const body = cfg.payload({ prompt, size });

  yield { type: "progress", stage: "submitting", pct: 5 };

  /* Submit to fal queue. Returns { request_id, status_url, response_url, cancel_url }. */
  const submitRes = await fetch(`${QUEUE_BASE}${cfg.endpoint}`, {
    method: "POST",
    headers: { "Authorization": `Key ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!submitRes.ok) {
    const text = await submitRes.text().catch(() => "");
    yield { type: "error", message: `fal submit HTTP ${submitRes.status}: ${text.slice(0, 300)}` };
    return;
  }
  const submitted = await submitRes.json();
  if (!submitted.status_url || !submitted.response_url) {
    yield { type: "error", message: `fal submit returned unexpected shape: ${JSON.stringify(submitted).slice(0, 200)}` };
    return;
  }

  yield { type: "progress", stage: "queued", pct: 15 };

  /* Poll the status URL. fal returns IN_QUEUE → IN_PROGRESS → COMPLETED. */
  const started = Date.now();
  const timeoutMs = 90_000;
  let pct = 15;
  while (Date.now() - started < timeoutMs) {
    await new Promise((r) => setTimeout(r, 1500));
    const statusRes = await fetch(submitted.status_url, {
      headers: { "Authorization": `Key ${key}` },
    });
    if (!statusRes.ok) continue;
    const status = await statusRes.json();
    if (status.status === "IN_QUEUE") {
      pct = Math.min(40, pct + 4);
      yield { type: "progress", stage: "queued", pct };
    } else if (status.status === "IN_PROGRESS") {
      pct = Math.min(85, pct + 10);
      yield { type: "progress", stage: "generating", pct };
    } else if (status.status === "COMPLETED") {
      /* Fetch the result from response_url */
      const resultRes = await fetch(submitted.response_url, {
        headers: { "Authorization": `Key ${key}` },
      });
      if (!resultRes.ok) {
        yield { type: "error", message: `fal result HTTP ${resultRes.status}` };
        return;
      }
      const result = await resultRes.json();
      const img = result.images?.[0];
      if (!img?.url) {
        yield { type: "error", message: "fal result has no image URL" };
        return;
      }
      yield {
        type: "done",
        asset_url:  img.url,
        width:      img.width,
        height:     img.height,
        content_type: img.content_type,
        model:      route,
        cost_usd:   cfg.cost_estimate_usd,
        seed:       result.seed,
        prompt_used: prompt,
      };
      return;
    } else if (status.status === "FAILED") {
      yield { type: "error", message: `fal job failed: ${JSON.stringify(status).slice(0, 300)}` };
      return;
    }
  }
  yield { type: "error", message: `fal job timed out after ${timeoutMs}ms` };
}

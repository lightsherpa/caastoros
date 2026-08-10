// ─────────────────────────────────────────────────────────────────────
// P3 — first production specialist run + QA gate.
//
// POST /api/runs/stream
//   Body: { specialistId, briefText, brandId? }
//   Auth: required.
//   SSE response with normalized events:
//     event: token    data: { text }
//     event: qa       data: { passed, voice_match, violations }
//                     deliverable runs also carry: { malformed, deliverable_count }
//     event: done     data: { runId, outputId, usage, qa, output, brand }
//                     output for deliverable runs: { kind:"deliverables", type, part,
//                       platform, deliverables:[{ title, body, platform, qa, status }], status }
//     event: error    data: { message }
//
// Side effects (in order):
//   1. Inserts a `briefs` row (one-off type) capturing the request text.
//   2. Inserts a `runs` row in `running` state (pins spec_version + bio_version).
//   3. Calls the specialist via the router; streams tokens to the client.
//   4. Runs a18 Voice QA on the full output text.
//   5. Updates `runs` with completion stats + cost.
//   6. Inserts `outputs` row + `qa_results` row + `ledger` debit row.
// ─────────────────────────────────────────────────────────────────────

import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { requireAuth } from "../middleware/auth.js";
import { supabaseAdmin } from "../lib/supabase.js";
import { loadBioForRun } from "../lib/load-brand-bio.js";
import { streamCompletion } from "../lib/models/router.js";
import { composeSpecialistPrompt } from "../lib/compose-specialist-prompt.js";
import { composeImagePrompt } from "../lib/compose-image-prompt.js";
import { voiceQa } from "../lib/qa-voice.js";
import { visionQa } from "../lib/qa-vision.js";
import { recordSignal } from "../lib/brandolph-memory.js";
import { generate as generateImage, isImageRoute } from "../lib/models/fal-image.js";
import { maxTokensForDeliverables, parseDeliverables, buildDeliverableContract, falSizeForPlatform } from "../lib/deliverables.js";
import { assertCreditsAvailable, creditErrorResponse, estimateRunCredits } from "../lib/credits.js";
import { resolveRunBrandId } from "../lib/brand-scope.js";

const app = new Hono();

app.post("/stream", requireAuth, async (c) => {
  const { workspaceId } = c.get("auth");
  let body;
  try { body = await c.req.json(); } catch { return c.json({ error: "Invalid JSON" }, 400); }
  const { specialistId, briefText, brandId, briefId: existingBriefId, briefMeta, modelOverride, revisionFeedback, deliverableSpec } = body || {};
  if (!specialistId || !briefText) return c.json({ error: "specialistId and briefText required" }, 400);

  /* Pin the run to an explicit brand. For a continuation/re-run, the brief is
     the authority; for a new brief, the caller must supply brandId. Never let
     loadBioForRun fall back to the workspace's oldest brand. */
  let existingBrief = null;
  let effectiveBrandId;
  if (existingBriefId) {
    const { data, error } = await supabaseAdmin
      .from("briefs").select("id, brand_id").eq("id", existingBriefId).maybeSingle();
    if (error || !data) return c.json({ error: "briefId not found or not in workspace" }, 404);
    existingBrief = data;
  }
  try {
    effectiveBrandId = resolveRunBrandId({ brandId, existingBriefBrandId: existingBrief?.brand_id });
  } catch (error) {
    const status = error.code === "BRAND_MISMATCH" ? 409 : 400;
    const message = error.code === "BRAND_REQUIRED" ? "Select a brand before creating a brief." : error.message;
    return c.json({ error:message, code:error.code }, status);
  }

  /* Re-run / revise — caller can override which model handles this
     run (curated per-spec dropdown in the SPA), and/or append revision
     feedback that gets threaded into the brief context.
     modelOverride is a full route string ("anthropic/...", "openrouter/...",
     "vendor/fal/..."). Validated downstream by the model router. */
  const effectiveBriefText = revisionFeedback?.trim()
    ? `${briefText}\n\nOperator's revision note: ${revisionFeedback.trim()}`
    : briefText;

  /* Spec lookup — must be active and exist. */
  const { data: spec, error: specErr } = await supabaseAdmin
    .from("specs")
    .select("id, specialist_id, version, payload")
    .eq("specialist_id", specialistId)
    .eq("active", true)
    .maybeSingle();
  if (specErr || !spec) return c.json({ error: `Spec ${specialistId} not active or not found` }, 400);

  /* Brand + BIO. Client-test runs must read only the latest certified BIO.
     Discovery creates a candidate; Steward certification turns it into canon. */
  let brandBio;
  try {
    brandBio = await loadBioForRun({ workspaceId, brandId: effectiveBrandId });
  } catch (err) {
    if (err.code === "BIO_NOT_CERTIFIED") {
      return c.json({ error: "BIO is awaiting Brand Steward certification.", code: err.code }, 409);
    }
    return c.json({ error: err.message || String(err) }, 400);
  }

  /* Effective route: caller override → spec default. The spec row in
     the DB is unchanged; the override applies to THIS run only. */
  const route = (typeof modelOverride === "string" && modelOverride.includes("/"))
    ? modelOverride
    : (spec.payload?.modelRouting?.primary || "");
  const isImage = isImageRoute(route);

  /* Deliverable mode: when the caller passes a deliverableSpec, a TEXT run
     returns N structured items (one LLM call) and an IMAGE run is sized to
     the platform. No deliverableSpec → legacy single-output behavior. */
  const dlv = (deliverableSpec && typeof deliverableSpec === "object") ? deliverableSpec : null;
  const isDeliverableText = !isImage && !!dlv && Number(dlv.count) >= 1;
  const creditsDebited = estimateRunCredits({ specPayload: spec.payload, deliverableSpec: dlv, isDeliverableText });
  const creditCheck = await assertCreditsAvailable(workspaceId, creditsDebited);
  if (!creditCheck.ok) return creditErrorResponse(c, creditCheck);

  /* Clone the spec so we don't mutate the cached payload — downstream
     adapters read modelRouting.primary off this object. */
  const effectiveSpec = modelOverride && modelOverride !== spec.payload?.modelRouting?.primary
    ? { ...spec, payload: { ...spec.payload, modelRouting: { ...(spec.payload?.modelRouting || {}), primary: route, reason: `re-run override · ${modelOverride}` } } }
    : spec;

  /* Prior outputs on this brief — when an assembly fires N specialists
     sequentially under one brief, every specialist after the first sees
     what its teammates already shipped. Skips the spec's own previous
     run (don't ask the same specialist to ape itself). */
  let priorOutputs = [];
  if (existingBriefId) {
    const { data: priorRuns } = await supabaseAdmin
      .from("runs")
      .select("specialist_id, outputs ( body, kind, status )")
      .eq("brief_id", existingBriefId)
      .neq("specialist_id", specialistId)
      .order("started_at", { ascending: true });
    priorOutputs = (priorRuns || []).flatMap((r) =>
      (r.outputs || [])
        .filter((o) => o.status !== "failed")
        .map((o) => ({ ...o, specialist_id: r.specialist_id }))
    );
  }

  /* Text specialists get the four-layer message structure (cached PLATFORM
     + BIO). Image specialists get a single flattened prompt string —
     Flux/Recraft etc. take one text input, not chat messages. */
  const system = isImage
    ? null
    : composeSpecialistPrompt({
        spec: effectiveSpec,
        brand: brandBio.brand,
        bio: brandBio.bio,
        refusals: brandBio.refusals,
        brief: effectiveBriefText,
        priorOutputs,
        deliverableContract: isDeliverableText
          ? buildDeliverableContract({ type: dlv.type, part: dlv.part, count: Number(dlv.count), platform: dlv.platform, withVisualDirection: !!dlv.withVisualDirection })
          : null,
      });

  const imagePrompt = isImage
    ? composeImagePrompt({
        spec: effectiveSpec,
        brand: brandBio.brand,
        bio: brandBio.bio,
        refusals: brandBio.refusals,
        brief: effectiveBriefText,
        sourceText: dlv?.sourceText || null,
        artDirection: dlv?.artDirection || null,
      })
    : null;

  return streamSSE(c, async (stream) => {
    const startedIso = new Date().toISOString();

    /* 1. Brief row — every specialist run pins to a brief. When the
       caller already created a brief earlier (e.g. assembly orchestration
       firing N specialists under the same intent), reuse it. Otherwise
       create a fresh one. Ownership check applies either way. */
    let briefId;
    if (existingBriefId) {
      if (!existingBrief || existingBrief.brand_id !== brandBio.brand.id) {
        await stream.writeSSE({ event: "error", data: JSON.stringify({ message: "briefId not found or not in brand" }) });
        return;
      }
      briefId = existingBrief.id;
    } else {
      /* Brief title prefers the Sharpener's editorial title (4–6 words,
         not a slice of raw text). Falls back to the first sharpened
         sentence, then to a truncated raw request. The payload stores
         the full Sharpener context so the Library can re-render the
         brief panel later without another model call. */
      const title =
        (briefMeta?.title && String(briefMeta.title).trim()) ||
        (briefMeta?.sharpenedBrief && String(briefMeta.sharpenedBrief).split(/[.!?]/)[0].trim().slice(0, 80)) ||
        (briefMeta?.rawBrief && String(briefMeta.rawBrief).trim().slice(0, 60)) ||
        briefText.slice(0, 60);

      const { data: briefRow, error: briefErr } = await supabaseAdmin
        .from("briefs")
        .insert({
          brand_id: brandBio.brand.id,
          title,
          type: "one_off",
          payload: {
            request:        briefMeta?.rawBrief || briefText,
            title,
            sharpenedBrief: briefMeta?.sharpenedBrief || "",
            tension:        briefMeta?.tension || "",
            refusals:       briefMeta?.refusals || [],
          },
          mode: "auto",
          status: "active",
        })
        .select("id")
        .single();
      if (briefErr || !briefRow) {
        await stream.writeSSE({ event: "error", data: JSON.stringify({ message: `brief insert failed: ${briefErr?.message}` }) });
        return;
      }
      briefId = briefRow.id;
    }

    /* 2. Runs row — pins spec_version + bio_version for reproducibility. */
    const { data: runRow } = await supabaseAdmin
      .from("runs")
      .insert({
        brief_id: briefId,
        specialist_id: spec.specialist_id,
        spec_version: spec.version,
        bio_version: brandBio.bio.version,
        status: "running",
        started_at: startedIso,
      })
      .select("id")
      .single();
    const runId = runRow?.id;

    /* 3. Stream the specialist response.
          Branch: text specialists stream tokens (router → Anthropic / OR);
          image specialists submit to fal, poll, download asset, upload
          to Supabase Storage, emit a single done event. */
    let output = "";
    let usage = null;
    let modelUsed = null;
    let imageResult = null;          /* { asset_url, model, cost_usd, prompt_used, ... } */

    try {
      if (isImage) {
        /* Image pipeline — single asset, no token streaming */
        for await (const ev of generateImage({
          route,
          prompt: imagePrompt,
          size: dlv?.platform ? falSizeForPlatform(dlv.platform) : (spec.payload?.image_size || "landscape_16_9"),
        })) {
          if (ev.type === "progress") {
            await stream.writeSSE({ event: "progress", data: JSON.stringify({ stage: ev.stage, pct: ev.pct }) });
          } else if (ev.type === "done") {
            imageResult = ev;
            /* Download from fal CDN and persist in Supabase Storage so the
               URL doesn't expire (fal links typically expire in days). */
            try {
              const imgRes = await fetch(ev.asset_url);
              const buf = new Uint8Array(await imgRes.arrayBuffer());
              const ext = (ev.content_type || "").includes("png") ? "png"
                       : (ev.content_type || "").includes("jpeg") ? "jpg"
                       : (ev.content_type || "").includes("webp") ? "webp" : "png";
              const objPath = `${workspaceId}/${brandBio.brand.id}/outputs/${runId}.${ext}`;
              const { error: upErr } = await supabaseAdmin.storage.from("bio-sources")
                .upload(objPath, buf, { contentType: ev.content_type || "image/png", upsert: true });
              if (!upErr) {
                const { data: signed } = await supabaseAdmin.storage.from("bio-sources")
                  .createSignedUrl(objPath, 60 * 60 * 24 * 365);
                if (signed?.signedUrl) imageResult.asset_url = signed.signedUrl;
              }
            } catch (e) {
              /* Non-fatal — fall back to fal's URL */
              console.warn("[runs] image upload to Storage failed:", e?.message || e);
            }
            usage = { provider: "fal", model: ev.model, cost_usd: ev.cost_usd, prompt_tokens: 0, completion_tokens: 0, cached_tokens: 0 };
            modelUsed = ev.model;
          } else if (ev.type === "error") {
            await stream.writeSSE({ event: "error", data: JSON.stringify({ message: ev.message }) });
            await supabaseAdmin.from("runs").update({ status: "failed", ended_at: new Date().toISOString() }).eq("id", runId);
            return;
          }
        }
      } else {
        /* Text pipeline — existing behaviour */
        for await (const ev of streamCompletion({
          spec: effectiveSpec,
          system,
          messages: [{ role: "user", content: effectiveBriefText }],
          maxTokens: isDeliverableText
            ? maxTokensForDeliverables({ count: Number(dlv.count), baseCr: effectiveSpec.payload?.cr_estimate ?? 8 })
            : (effectiveSpec.payload?.cr_estimate ?? 8) * 100,
        })) {
          if (ev.type === "token") {
            output += ev.text;
            await stream.writeSSE({ event: "token", data: JSON.stringify({ text: ev.text }) });
          } else if (ev.type === "done") {
            usage = ev.usage;
            modelUsed = ev.usage?.model;
          } else if (ev.type === "error") {
            await stream.writeSSE({ event: "error", data: JSON.stringify({ message: ev.message }) });
            await supabaseAdmin.from("runs").update({
              status: "failed",
              ended_at: new Date().toISOString(),
            }).eq("id", runId);
            return;
          }
        }
      }

      /* 4. QA pass.
            Text → a18 Voice QA (regex + Gemini Flash voice-drift).
            Image → a24 Brand Consistency QA (Gemini Flash vision) —
                    scores the rendered image against the BIO visual
                    rules. Verdict {passed, brand_match, violations}. */
      let qa;
      let deliverables = null;        /* set on the deliverable-text path */
      if (isImage) {
        const v = await visionQa({ assetUrl: imageResult?.asset_url, bio: brandBio.bio });
        qa = { ...v, kind: "image_a24" };
      } else if (isDeliverableText) {
        /* One LLM call produced N items; QA each so a single weak post is
           flagged individually instead of passing the whole batch. The QA
           calls are independent (cheap tier) → run them concurrently so the
           output card isn't stalled by N serial round-trips. (If a provider
           rate limit ever bites at high count, cap concurrency here.) */
        const parsed = parseDeliverables(output);
        const dqResults = await Promise.all(
          parsed.deliverables.map((d) => voiceQa({ body: d.body, bio: brandBio.bio, refusals: brandBio.refusals }))
        );
        deliverables = [];
        let passedAll = true;
        const qaUsage = { cost_usd: 0 };
        parsed.deliverables.forEach((d, i) => {
          const dq = dqResults[i];
          if (!dq.passed) passedAll = false;
          if (typeof dq.usage?.cost_usd === "number") qaUsage.cost_usd += dq.usage.cost_usd;
          deliverables.push({ ...d, platform: dlv.platform || "generic", qa: dq, status: dq.passed ? "approved" : "flagged" });
        });
        qa = { passed: passedAll, voice_match: null, violations: [], usage: qaUsage, malformed: parsed.malformed, deliverable_count: deliverables.length };
      } else {
        qa = await voiceQa({ body: output, bio: brandBio.bio, refusals: brandBio.refusals });
      }
      await stream.writeSSE({ event: "qa", data: JSON.stringify(qa) });

      /* 5. Update runs with completion stats + cost. */
      const endedIso = new Date().toISOString();
      const latencyMs = Date.parse(endedIso) - Date.parse(startedIso);
      const baseCost = usage?.cost_usd ?? null;
      const qaCost = qa.usage?.cost_usd ?? null;
      const totalCost = baseCost != null || qaCost != null ? (baseCost || 0) + (qaCost || 0) : null;

      await supabaseAdmin.from("runs").update({
        status: "completed",
        model_used: modelUsed,
        prompt_tokens: usage?.prompt_tokens,
        completion_tokens: usage?.completion_tokens,
        cached_tokens: usage?.cached_tokens,
        cost_usd: totalCost,
        ended_at: endedIso,
        latency_ms: latencyMs,
      }).eq("id", runId);

      /* 6a. Output row. Image runs carry asset_url + prompt_used in the
            body; text runs carry text + rationale. */
      const outputKind = isImage
        ? (spec.payload?.code === "L2-19" ? "identity_drafts"
        :  spec.payload?.code === "L2-20" ? "hero_kv"
        :  spec.payload?.code === "L2-21" ? "editorial_image"
        :  "image")
        : (spec.payload?.kind || "copy");
      const outputBody = isImage
        ? {
            kind: "image",
            asset_url:   imageResult?.asset_url,
            width:       imageResult?.width,
            height:      imageResult?.height,
            seed:        imageResult?.seed,
            prompt_used: imageResult?.prompt_used,
          }
        : isDeliverableText
        ? { kind: "deliverables", type: dlv.type, part: dlv.part, platform: dlv.platform || "generic", deliverables }
        : { text: output, rationale: null };
      const { data: outputRow } = await supabaseAdmin
        .from("outputs")
        .insert({
          run_id: runId,
          brief_id: briefId,
          kind: outputKind,
          body: outputBody,
          asset_url: isImage ? imageResult?.asset_url : null,
          status: qa.passed ? "approved" : "flagged",
          rationale: qa.violations?.join("; ") || null,
        })
        .select("id")
        .single();

      /* 6b. QA results row. */
      if (outputRow?.id) {
        await supabaseAdmin.from("qa_results").insert({
          output_id: outputRow.id,
          refusal_id: "voice_qa",
          passed: qa.passed,
          evidence: qa.violations?.length ? qa.violations.join("; ") : null,
        });
      }

      /* 6c. Ledger debit — only for completed/approved runs. Flagged
         runs still debit (work was done) but the ledger note carries
         the flag for transparency. */
      await supabaseAdmin.from("ledger").insert({
        workspace_id: workspaceId,
        run_id: runId,
        credits: creditsDebited,
        kind: qa.passed ? "run" : "run_flagged",
        balance_after: creditCheck.balance - creditsDebited,
      });

      /* Brandolph memory · signal this run + any re-run/revision context. */
      const memoryKind = qa.passed ? "run.approved" : "run.flagged";
      recordSignal({
        brandId:      brandBio.brand.id,
        kind:         memoryKind,
        specialistId: spec.specialist_id,
        runId,
        outputId:     outputRow?.id,
        createdBy:    c.get("auth")?.userId,
        payload: {
          voice_match: typeof qa.voice_match === "number" ? qa.voice_match : undefined,
          brand_match: typeof qa.brand_match === "number" ? qa.brand_match : undefined,
          model_used:  modelUsed || route,
          model_override: modelOverride || null,
          had_revision: !!revisionFeedback,
        },
      });
      if (modelOverride) {
        /* Classify the re-run direction so the admin dashboard can see
           "this brand keeps escalating to Opus on a12 — promote it" or
           "this brand can drop to Flash on a16 — accept the saving". */
        const opusOrPro = /opus|gemini-2\.5-pro|flux-1\.1-pro/i.test(modelOverride);
        recordSignal({
          brandId:      brandBio.brand.id,
          kind:         opusOrPro ? "spec.rerun_with_premium" : "spec.rerun_with_cheap",
          specialistId: spec.specialist_id,
          runId,
          outputId:     outputRow?.id,
          createdBy:    c.get("auth")?.userId,
          payload: { from: spec.payload?.modelRouting?.primary, to: modelOverride },
        });
      }
      if (revisionFeedback) {
        recordSignal({
          brandId:      brandBio.brand.id,
          kind:         "spec.revision",
          specialistId: spec.specialist_id,
          runId,
          outputId:     outputRow?.id,
          createdBy:    c.get("auth")?.userId,
          payload: { feedback_preview: revisionFeedback.slice(0, 200) },
        });
      }

      /* Final done event with everything the client needs to render the
         output card with the moat-defining attribution footer. */
      await stream.writeSSE({
        event: "done",
        data: JSON.stringify({
          runId,
          briefId,
          outputId: outputRow?.id,
          usage: usage ? {
            provider: usage.provider,
            model: usage.model,
            prompt_tokens: usage.prompt_tokens,
            completion_tokens: usage.completion_tokens,
            cached_tokens: usage.cached_tokens,
          } : null,
          qa,
          output: isImage
            ? { kind: outputKind, asset_url: imageResult?.asset_url, width: imageResult?.width, height: imageResult?.height, status: qa.passed ? "approved" : "flagged",
                bio_visual: {
                  palette: brandBio.bio?.visual?.palette || [],
                  type:    brandBio.bio?.visual?.type || null,
                  imagery: brandBio.bio?.visual?.imagery || [],
                } }
            : isDeliverableText
            ? { kind: "deliverables", type: dlv.type, part: dlv.part, platform: dlv.platform || "generic", deliverables, status: qa.passed ? "approved" : "flagged" }
            : { text: output, status: qa.passed ? "approved" : "flagged" },
          brand: {
            id: brandBio.brand.id,
            name: brandBio.brand.name,
            bioVersion: brandBio.bio.version,
            certifiedBy: brandBio.bio.certified_by || null,
          },
          spec: {
            id: spec.specialist_id,
            name: spec.payload?.name,
            version: spec.version,
          },
          credits_debited: creditsDebited,
        }),
      });
    } catch (err) {
      await stream.writeSSE({ event: "error", data: JSON.stringify({ message: err?.message || String(err) }) });
      await supabaseAdmin.from("runs").update({
        status: "failed",
        ended_at: new Date().toISOString(),
      }).eq("id", runId);
      recordSignal({
        brandId:      brandBio.brand.id,
        kind:         "run.failed",
        specialistId: spec.specialist_id,
        runId,
        createdBy:    c.get("auth")?.userId,
        payload:      { error: String(err?.message || err).slice(0, 240) },
      });
    }
  });
});

/* GET /api/runs/:id — read a finished run (for the SPA to load output
   cards on brief detail pages later). */
app.get("/:id", requireAuth, async (c) => {
  const { workspaceId } = c.get("auth");
  const runId = c.req.param("id");
  const { data: run } = await supabaseAdmin
    .from("runs")
    .select(`
      id, brief_id, specialist_id, spec_version, bio_version, model_used,
      status, prompt_tokens, completion_tokens, cached_tokens,
      latency_ms, started_at, ended_at,
      brief:briefs ( id, title, brand_id, payload )
    `)
    .eq("id", runId)
    .maybeSingle();
  if (!run || run.brief?.brand_id == null) return c.json({ error: "Not found" }, 404);

  /* Workspace check via the brief's brand */
  const { data: brand } = await supabaseAdmin
    .from("brands")
    .select("workspace_id")
    .eq("id", run.brief.brand_id)
    .maybeSingle();
  if (!brand || brand.workspace_id !== workspaceId) return c.json({ error: "Forbidden" }, 403);

  const { data: outputs } = await supabaseAdmin
    .from("outputs")
    .select("id, kind, body, status, rationale")
    .eq("run_id", runId);
  const { data: qaResults } = await supabaseAdmin
    .from("qa_results")
    .select("*")
    .in("output_id", (outputs || []).map((o) => o.id));

  return c.json({ run, outputs: outputs || [], qa: qaResults || [] });
});

export default app;

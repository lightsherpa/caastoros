// ─────────────────────────────────────────────────────────────────────
// P1 · a30 BIO Compiler — Discovery → BIO synthesis
//
// Trigger: event "discovery/start" with { brandId, url, workspaceId, sources? }
// Steps (each retried independently by Inngest on failure):
//   1. Scrape the primary URL via Firecrawl → store as bio_sources row
//   2. Synthesize BIO JSON via Anthropic Opus on the scraped markdown
//   3. Write new bios row with certified=false (Steward cert lands in P1.5)
//
// The BIO shape mirrors server/src/data/vinilo.js so prompt.js
// renderBioLayer can consume the result with no changes.
// Visual fields (palette/type/imagery) are placeholder defaults — a
// vision pass on screenshots fills those in P5 (image specialists).
// ─────────────────────────────────────────────────────────────────────

import { inngest } from "../../lib/inngest.js";
import { supabaseAdmin } from "../../lib/supabase.js";
import { scrape, mapAndScrape } from "../../lib/firecrawl.js";
import { assignSteward } from "../../lib/assign-steward.js";
import { streamCompletion } from "../../lib/models/router.js";
import { scoreBio } from "../../lib/score-bio.js";
import { extractPalette, extractFonts } from "../../lib/extract-visual-deterministic.js";
import { extractImageryAvoid } from "../../lib/extract-visual-vision.js";

// DISCOVERY_V2 master flag (default OFF). When unset the pipeline runs exactly
// as before — single homepage scrape, empty visual{}, no upload/instagram read.
// The cheap/additive improvements (confidence/missing/refusals/scoreBio) are
// flagless and always on; only the expensive crawl + visual passes are gated.
const V2 = process.env.DISCOVERY_V2 === "1";

/* BIO Compiler model — Gemini 2.5 Pro via OpenRouter.
   Per cost analysis 2026-05-26: ~$0.08 / BIO vs ~$0.78 with Opus 4.7
   for the same task (extract facts + synthesize watchouts from scraped
   markdown). Quality drift is human-caught at the Steward review step
   (P1.5), so cheaper-but-strong is the right tradeoff here.
   Flip back to "anthropic/claude-opus-4-7" or "anthropic/claude-sonnet-4-6"
   by editing this one line. */
const COMPILER_SPEC = {
  payload: {
    name: "a30 BIO Compiler",
    modelRouting: { primary: "openrouter/google/gemini-2.5-pro", reason: "cost-optimized BIO synthesis (rev-2 §17 — Steward catches quality drift)" },
    cr_estimate: 40,
  },
};

const COMPILER_SYSTEM = `You are a30 BIO Compiler — a senior brand analyst who reads a brand's web presence and synthesizes a Brand Intelligence Object (BIO).

You receive raw scraped text from the brand's web presence (one or more pages, and possibly uploaded brand documents and a social handle). Synthesize a structured BIO in JSON matching the schema below. Be conservative — only include claims you can support from the source material. Never invent facts.

Output ONLY the JSON object — no preamble, no markdown fence, no commentary.

The JSON has the value schema below PLUS three additive top-level keys: "confidence", "missing", and "refusals". The value fields stay plain strings/arrays exactly as shown — do NOT nest confidence into them.

Value schema:
{
  "identity": {
    "positioning": "a single sentence — what the brand actually is",
    "category": "industry / sub-category",
    "founded": "year + city if known, else just year, else null",
    "pillars": ["3–4 short keyword pillars"]
  },
  "audience": {
    "primary": "1–2 sentences describing primary audience",
    "secondary": "1 sentence",
    "tertiary": "1 sentence or null",
    "jtbd": ["3 jobs-to-be-done phrased from the customer's POV"]
  },
  "voice": {
    "register": "tone descriptors — editorial, technical, playful, etc.",
    "forbidden": ["5–8 words the brand should never use"],
    "rhythm": "1 sentence on sentence rhythm",
    "signatures": ["2–3 voice signatures the brand uses"]
  },
  "goals": {
    "northStar": "the brand's long-term goal in one line",
    "q2": "near-term priority if surfaced, else null",
    "q3": "next priority if surfaced, else null"
  },
  "strategic": {
    "watchouts": ["2–3 strategic tensions a CMO would name"],
    "notList": ["3–4 things the brand explicitly is NOT"]
  },
  "visual": {
    "palette": [],
    "type": [],
    "imagery": [],
    "avoid": []
  }
}

Additive keys (emit ALL THREE in the same JSON object):

"confidence": a sibling map keyed by the dotted path of each value field you populated — "section.key" → { "conf": 0-100, "source": "where you got it" }. Calibrate honestly:
  - 85+ ONLY when the field is stated explicitly in the source material.
  - 30–84 when it is reasonably inferable but not explicit.
  - Below 30 means you cannot really support it: in that case LEAVE THE VALUE EMPTY (null, "", or []) and instead add an entry to "missing" — do not emit a low-confidence value. The "source" string should name the page/document/handle it came from (e.g. "homepage hero", "about page", "uploaded brand-deck.pdf", "instagram bio").
  Example: "confidence": { "identity.positioning": { "conf": 88, "source": "homepage hero + about" }, "identity.founded": { "conf": 40, "source": "inferred — not stated" } }

"missing": an array of { "field": "dotted.path", "why": "short reason it could not be supported" } for every value field you could not honestly fill from the sources. Example: [ { "field": "goals.q3", "why": "no roadmap or quarterly priorities surfaced" } ].

"refusals": an array of 3–6 brand-specific, imperative refusal sentences (each tells the brand's writers/designers what NOT to do), derived from voice.forbidden and strategic.notList. Make them concrete to THIS brand, not generic. Example: "Never use corporate jargon like 'synergy' or 'leverage'." / "Do not position the brand as a budget option."`;

export const compileBio = inngest.createFunction(
  {
    id: "compile-bio",
    name: "Compile BIO from URL",
    retries: 2,
    triggers: [{ event: "discovery/start" }],
  },
  async ({ event, step, logger }) => {
    const { brandId, url, workspaceId, instagram, mode } = event.data || {};
    if (!brandId || !url) throw new Error("Event missing brandId or url");
    // `mode:"teardown"` = self-serve lead magnet (CAA-33). Same synthesis, but
    // the BIO is an unclaimed lead artifact that never feeds a specialist run,
    // so we skip the human Steward cert (Step 4) — a Steward is only spent once
    // the lead claims/pilots. Everything else is identical to Discovery.
    const isTeardown = mode === "teardown";
    logger.info("BIO compile starting", { brandId, url, v2: V2, mode: mode || "discovery" });

    // ── Step 1 · Scrape ───────────────────────────────────────────
    // V2: crawl ≤6 high-signal pages (one bio_sources row each), concat markdown.
    // OFF: exact current single-homepage-scrape behavior.
    const scraped = await step.run("scrape-primary-url", async () => {
      if (V2) {
        const pages = await mapAndScrape(url, { max: 6, formats: ["markdown"] });
        // Insert one bio_sources row per crawled page (kind:url_scrape, bucket:null).
        for (const page of pages) {
          const { error } = await supabaseAdmin.from("bio_sources").insert({
            brand_id: brandId,
            kind: "url_scrape",
            bucket: null,
            src: page.url,
            signals: {
              title: page.title || null,
              markdown_chars: page.markdown?.length || 0,
            },
            raw_ref: null,
          });
          if (error) throw new Error(`bio_sources insert failed: ${error.message}`);
        }
        // Concatenate page markdowns, labeled by source URL.
        const markdown = pages
          .map((p) => `## SOURCE: ${p.url}${p.title ? ` (${p.title})` : ""}\n\n${p.markdown || ""}`)
          .join("\n\n");
        return {
          markdown,
          title: pages[0]?.title || null,
        };
      }

      const result = await scrape(url, { formats: ["markdown"], onlyMainContent: true });
      // Persist as a bio_sources row (URL-derived, bucket=null per rev-2 §5.3)
      const { error } = await supabaseAdmin.from("bio_sources").insert({
        brand_id: brandId,
        kind: "url_scrape",
        bucket: null,
        src: url,
        signals: {
          title: result.metadata?.title,
          description: result.metadata?.description,
          markdown_chars: result.markdown?.length || 0,
        },
        raw_ref: null,
      });
      if (error) throw new Error(`bio_sources insert failed: ${error.message}`);
      return {
        markdown: result.markdown || "",
        title: result.metadata?.title || null,
      };
    });

    // ── Step 1b · Uploaded sources + instagram (V2 only) ─────────
    // Read brand-uploaded files + the instagram handle and fold them into the
    // synthesis input. Text files (pdf/docx/pptx/txt/md) are fetched via their
    // signed raw_ref and run through Firecrawl→markdown; images are skipped
    // (the visual bucket is handled by the visual step). Built as labeled
    // blocks so the model can cite which source a fact came from.
    //
    // ponytail: this relies on uploads having committed to bio_sources during
    // the ~10–30s crawl window above (uploads currently fire just before
    // discovery/start). If logs ever show a race (uploads arriving after this
    // read), the upgrade path is a POST /api/discovery/resolve-brand endpoint
    // that returns brandId so the UI can attach files before firing discovery.
    const TEXT_EXTS = new Set(["pdf", "docx", "pptx", "txt", "md"]);
    const extraSources = V2
      ? await step.run("gather-upload-sources", async () => {
          const blocks = [];

          const { data: rows } = await supabaseAdmin
            .from("bio_sources")
            .select("src, signals, raw_ref")
            .eq("brand_id", brandId)
            .eq("kind", "file_upload");

          for (const row of rows || []) {
            const ext = String(row.signals?.ext || "").toLowerCase().replace(/^\./, "");
            if (!TEXT_EXTS.has(ext)) continue;          // skip images / non-text
            if (!row.raw_ref) continue;
            try {
              const result = await scrape(row.raw_ref, { formats: ["markdown"] });
              const text = (result?.markdown || "").slice(0, 12000); // cap ~12k each
              if (text.trim()) {
                blocks.push(`## UPLOADED FILE: ${row.src || "(file)"}\n\n${text}`);
              }
            } catch {
              // a single unreadable upload must not fail the BIO
            }
          }

          // Instagram handle (collected at discovery, passed through event.data).
          if (instagram) {
            blocks.push(`## INSTAGRAM HANDLE\n\n${instagram}`);
          }

          return blocks;
        })
      : [];

    // ── Step 2 · Synthesize ──────────────────────────────────────
    const bioPayload = await step.run("synthesize-bio", async () => {
      // Build the synthesis input under a ~48k char budget. Crawled pages come
      // first; labeled upload texts + instagram fill the remainder.
      const INPUT_BUDGET = 48000;
      let synthInput = scraped.markdown.slice(0, INPUT_BUDGET);
      for (const block of extraSources) {
        if (synthInput.length >= INPUT_BUDGET) break;
        const remaining = INPUT_BUDGET - synthInput.length;
        synthInput += `\n\n${block.slice(0, remaining)}`;
      }

      let text = "";
      let usage = null;
      for await (const ev of streamCompletion({
        spec: COMPILER_SPEC,
        system: COMPILER_SYSTEM,
        messages: [
          { role: "user", content: `Source: ${url}\nTitle: ${scraped.title || "(none)"}\n\n--- SCRAPED MARKDOWN ---\n\n${synthInput}` },
        ],
        maxTokens: 5000,
      })) {
        if (ev.type === "token") text += ev.text;
        else if (ev.type === "done") usage = ev.usage;
        else if (ev.type === "error") throw new Error(`Compiler error: ${ev.message}`);
      }

      if (usage?.cost_usd != null) {
        logger.info("BIO compile cost", {
          model:    usage.model,
          provider: usage.provider,
          cost_usd: usage.cost_usd,
          in:       usage.prompt_tokens,
          out:      usage.completion_tokens,
        });
      }

      // Be defensive: some models wrap JSON in code fences despite instruction.
      const stripped = text
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```\s*$/i, "")
        .trim();
      try {
        return JSON.parse(stripped);
      } catch (err) {
        throw new Error(`Compiler returned non-JSON: ${stripped.slice(0, 300)}`);
      }
    });

    // ── Step 2b · Visual extraction (V2 only) ────────────────────
    // Palette + fonts are deterministic ($0) from the homepage rawHtml; imagery
    // + avoid come from ONE Gemini Flash vision call on the screenshot, grounded
    // in the just-synthesized voice + notList. Whole step is best-effort: any
    // failure leaves visual arrays empty and never fails the BIO.
    if (V2) {
      const visual = await step.run("extract-visual", async () => {
        try {
          const result = await scrape(url, {
            formats: ["rawHtml", "screenshot"],
            onlyMainContent: false,
          });
          const rawHtml = result?.rawHtml || "";
          const screenshotUrl = result?.screenshot || null;

          const { imagery, avoid } = await extractImageryAvoid({
            screenshotUrl,
            voice: bioPayload.voice,
            notList: bioPayload.strategic?.notList,
          });

          return {
            palette: extractPalette(rawHtml),
            type: extractFonts(rawHtml),
            imagery,
            avoid,
          };
        } catch {
          // never let the visual pass invalidate the BIO
          return { palette: [], type: [], imagery: [], avoid: [] };
        }
      });
      bioPayload.visual = visual;
    }
    // When NOT V2, visual stays as the model emitted it (empty arrays) — as today.

    // ── Step 3 · Write bios row (uncertified) ────────────────────
    const bioRow = await step.run("write-bio-row", async () => {
      // Find current max version for this brand → +1
      const { data: latest } = await supabaseAdmin
        .from("bios")
        .select("version")
        .eq("brand_id", brandId)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      const nextVersion = (latest?.version || 0) + 1;

      const { data, error } = await supabaseAdmin
        .from("bios")
        .insert({
          brand_id: brandId,
          version: nextVersion,
          payload: bioPayload,
          score: scoreBio(bioPayload), // deterministic score from coverage/conf/diversity
          certified: false,                // Steward cert (P1.5) flips this later
        })
        .select("id, version")
        .single();
      if (error) throw new Error(`bios insert failed: ${error.message}`);
      logger.info("BIO compiled", { brandId, version: data.version, bioId: data.id });
      return data;
    });

    // ── Step 3b · Seed brand refusals (only if none yet) ─────────
    // Write the model-generated refusals to brands.refusals so load-brand-bio
    // serves them instead of the Vinilo fallback. Guard: only when the brand's
    // current refusals are empty/null — never clobber Steward edits.
    await step.run("write-brand-refusals", async () => {
      const refusals = Array.isArray(bioPayload.refusals)
        ? bioPayload.refusals.filter((r) => typeof r === "string" && r.trim())
        : [];
      if (refusals.length === 0) return { written: false, reason: "no refusals" };

      const { data: brand } = await supabaseAdmin
        .from("brands")
        .select("refusals")
        .eq("id", brandId)
        .maybeSingle();

      // text[] column defaults to '{}' — treat empty array / null as unset.
      if (brand?.refusals?.length) return { written: false, reason: "already set" };

      const { error } = await supabaseAdmin
        .from("brands")
        .update({ refusals })
        .eq("id", brandId);
      if (error) throw new Error(`brands.refusals update failed: ${error.message}`);
      return { written: true, count: refusals.length };
    });

    // ── Step 4 · Enqueue Steward certification job ──────────────
    // Per rev-2 §5: every BIO is certified by a senior human before
    // any specialist run reads it. Discovery just produced an
    // uncertified BIO — queue a Steward to review. Assignment uses
    // the shared assignSteward() helper (P1.5-002) which handles
    // round-robin + Lead-Steward capacity fallback.
    //
    // Teardown (CAA-33) skips this: an anonymous lead's BIO must never spend
    // scarce Steward capacity. It stays uncertified (certified=false) and is
    // read only by the gated report, which never triggers a specialist run.
    // On claim/pilot the claim flow enqueues the onboarding cert instead.
    if (isTeardown) {
      logger.info("Teardown lead — skipping Steward cert", { brandId, bioId: bioRow.id });
      return { bioId: bioRow.id, version: bioRow.version, brandId, stewardJobId: null, mode: "teardown" };
    }

    const stewardJob = await step.run("enqueue-steward-cert", async () => {
      const { data: job, error } = await supabaseAdmin
        .from("steward_jobs")
        .insert({
          bio_id: bioRow.id,
          brand_id: brandId,
          kind: "onboarding",
          status: "queued",
        })
        .select("id")
        .single();
      if (error) throw new Error(`steward_jobs insert failed: ${error.message}`);
      const assignment = await assignSteward(job.id);
      logger.info("Steward cert queued", {
        jobId: job.id,
        assignedTo: assignment.name || "(unassigned)",
        override: assignment.override || null,
      });
      return { id: job.id, ...assignment };
    });

    return { bioId: bioRow.id, version: bioRow.version, brandId, stewardJobId: stewardJob.id };
  }
);

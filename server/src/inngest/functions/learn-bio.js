// ─────────────────────────────────────────────────────────────────────
// P4 · BIO learning loop — Brandolph learns from approved/edited work.
//
// ponytail: manual trigger only for now; add auto-trigger at N approved
// outputs later. (The auto-threshold is deferred — do NOT build it here.)
//
// Trigger: event "bio/learn.requested" with { brandId, workspaceId }.
// ONE cheap model call (Gemini Flash) proposes BIO field improvements
// grounded in THIS brand's actual work. Proposals fold in via
// mergeLearnedPatch under strict MOAT rules and land as a NEW,
// UNCERTIFIED bios row — never auto-certified, never overwriting a
// confident human value. A notification invites the owner to review &
// re-certify. NO Steward job is enqueued: this is a draft, not a cert.
// ─────────────────────────────────────────────────────────────────────

import { inngest } from "../../lib/inngest.js";
import { supabaseAdmin } from "../../lib/supabase.js";
import { streamCompletion } from "../../lib/models/router.js";
import { scoreBio } from "../../lib/score-bio.js";
import { computeFocus } from "../../lib/bio-focus.js";
import { loadBrandMemorySummary } from "../../lib/brandolph-memory.js";
import { mergeLearnedPatch } from "../../lib/bio-learn-merge.js";
import { notify, brandOwnerUserId } from "../../lib/notify.js";

/* BIO Learner model — cheapest capable text route (Gemini Flash via
   OpenRouter). This is a cost-sensitive background job: exactly ONE model
   call per run, no verifier, no visual pass. Quality is human-caught at
   the re-certify step, so cheap-but-grounded is the right tradeoff.
   Flip the route by editing this one line. */
const LEARNER_SPEC = {
  payload: {
    name: "a30 BIO Learner",
    modelRouting: { primary: "openrouter/google/gemini-3.6-flash", reason: "cheap background learning loop; human re-certifies before use" },
    cr_estimate: 20,
  },
};

const LEARNER_SYSTEM = `You are the a30 BIO Learner — you improve a brand's Brand Intelligence Object (BIO) by learning from the brand's OWN approved and edited work.

You receive: the current BIO (JSON), a ranked FOCUS list of fields that are gaps or low-confidence, and a summary of what has actually worked for this brand. Propose small, grounded improvements to ONLY the focus fields.

Hard rules:
- ONLY propose fields that are gaps (empty/missing) or low-confidence in the current BIO. NEVER touch a field that is already confident.
- Ground EVERY proposal in the brand's ACTUAL work shown to you. NEVER invent facts, names, dates, or claims the material does not support. If you cannot support a field, omit it.
- Keep each value in the same plain shape as the existing BIO field: a string for string fields, an array of short strings for array fields. Do NOT nest confidence into a value.
- Every "source" string MUST start with "learned from work · " followed by a short evidence cue (e.g. "learned from work · approved Headlines runs").
- Calibrate "conf" (0-100) honestly: only go high when the work strongly and repeatedly supports the field.

Output STRICT JSON ONLY — no preamble, no markdown fence:
{ "patches": [ { "path": "identity.positioning", "value": "<string|array>", "conf": 0-100, "source": "learned from work · <evidence>" } ] }
If nothing is well-supported, return { "patches": [] }.`;

export const learnBio = inngest.createFunction(
  {
    id: "learn-bio",
    name: "Learn BIO improvements from approved/edited work",
    retries: 2,
    triggers: [{ event: "bio/learn.requested" }],
  },
  async ({ event, step, logger }) => {
    const { brandId, workspaceId } = event.data || {};
    if (!brandId) throw new Error("Event missing brandId");
    logger.info("BIO learn starting", { brandId, workspaceId });

    // ── Step 1 · Load latest BIO (highest version) ───────────────
    const latestBio = await step.run("load-latest-bio", async () => {
      const { data } = await supabaseAdmin
        .from("bios")
        .select("id, version, payload")
        .eq("brand_id", brandId)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data || null;
    });
    if (!latestBio) {
      logger.info("BIO learn skipped — no bio", { brandId });
      return { skipped: "no bio" };
    }
    const payload = latestBio.payload || {};
    const latest = latestBio.version;

    // ── Step 2 · Gather learning inputs (best-effort; empty is fine) ──
    // Brand memory summary + a slice of recent approved/edited work.
    // Focus targets tell the model WHICH gap/low-confidence fields to
    // fill FIRST. All reads are best-effort — never a model call.
    const inputs = await step.run("gather-learning-inputs", async () => {
      let memory = "";
      try { memory = await loadBrandMemorySummary(brandId); } catch { /* best-effort */ }

      const evidence = [];
      try {
        const { data: signals } = await supabaseAdmin
          .from("brand_signals")
          .select("kind, payload, created_at")
          .eq("brand_id", brandId)
          .in("kind", ["run.approved", "run.edited", "output.handoff_humans"])
          .order("created_at", { ascending: false })
          .limit(40);
        if (signals?.length) {
          evidence.push(
            "## RECENT SIGNALS\n" +
              signals.map((s) => `- ${s.kind} ${JSON.stringify(s.payload || {}).slice(0, 200)}`).join("\n")
          );
        }
      } catch { /* best-effort */ }

      try {
        const { data: briefRows } = await supabaseAdmin
          .from("briefs").select("id").eq("brand_id", brandId)
          .order("created_at", { ascending: false }).limit(25);
        const briefIds = (briefRows || []).map((b) => b.id);
        if (briefIds.length) {
          const { data: outs } = await supabaseAdmin
            .from("outputs")
            .select("kind, body, status")
            .in("brief_id", briefIds)
            .eq("status", "approved")
            .order("created_at", { ascending: false })
            .limit(15);
          if (outs?.length) {
            evidence.push(
              "## RECENT APPROVED OUTPUTS\n" +
                outs.map((o) => `- [${o.kind}] ${JSON.stringify(o.body || {}).slice(0, 400)}`).join("\n")
            );
          }
        }
      } catch { /* best-effort */ }

      return { memory: memory || "", evidence: evidence.join("\n\n") };
    });

    // Focus list = ranked gaps + low-confidence fields (pure). Drop the
    // rest so the model only sees what it's allowed to touch.
    const focus = computeFocus(payload)
      .map((f) => `- ${f.field} (${f.status}${f.conf != null ? ` ${f.conf}` : ""}) · ${f.label}`)
      .slice(0, 14)
      .join("\n");

    // ── Step 3 · Propose patches — ONE cheap model call ──────────
    const patches = await step.run("propose-patches", async () => {
      const userBlock = [
        `Brand: ${brandId}`,
        ``,
        `--- CURRENT BIO (JSON) ---`,
        JSON.stringify(payload).slice(0, 24000),
        ``,
        `--- FOCUS FIELDS (fill these first; gaps + low-confidence only) ---`,
        focus || "(no focus targets — propose nothing unless strongly supported)",
        ``,
        `--- WHAT HAS WORKED FOR THIS BRAND ---`,
        inputs.memory || "(no memory summary available)",
        ``,
        inputs.evidence || "(no recent work sample available)",
      ].join("\n");

      let text = "";
      let usage = null;
      for await (const ev of streamCompletion({
        spec: LEARNER_SPEC,
        system: LEARNER_SYSTEM,
        messages: [{ role: "user", content: userBlock }],
        maxTokens: 2000,
      })) {
        if (ev.type === "token") text += ev.text;
        else if (ev.type === "done") usage = ev.usage;
        else if (ev.type === "error") throw new Error(`Learner error: ${ev.message}`);
      }

      if (usage?.cost_usd != null) {
        logger.info("BIO learn cost", {
          model: usage.model, provider: usage.provider, cost_usd: usage.cost_usd,
          in: usage.prompt_tokens, out: usage.completion_tokens,
        });
      }

      // Be defensive: some models wrap JSON in code fences despite instruction.
      const stripped = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
      try {
        const parsed = JSON.parse(stripped);
        return Array.isArray(parsed?.patches) ? parsed.patches : [];
      } catch {
        // A malformed learner response must not fail the job — just learn nothing this run.
        logger.warn("Learner returned non-JSON — no patches this run", { brandId });
        return [];
      }
    });

    // ── Step 4 · Merge under MOAT rules (pure) ───────────────────
    // Fills gaps + strengthens low-confidence fields; NEVER overwrites a
    // confident (conf ≥ 80) human-shaped value; NEVER certifies.
    const { payload: merged, changedCount } = mergeLearnedPatch(payload, patches);
    if (changedCount === 0) {
      logger.info("BIO learn produced no changes", { brandId });
      return { changed: 0 };
    }

    // ── Step 5 · Write NEW bios row (UNCERTIFIED draft) ──────────
    const bioRow = await step.run("write-learned-bio", async () => {
      // Re-read max version fresh for retry-safety (mirrors compile-bio).
      const { data: cur } = await supabaseAdmin
        .from("bios")
        .select("version")
        .eq("brand_id", brandId)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      const nextVersion = (cur?.version || 0) + 1;

      const { data, error } = await supabaseAdmin
        .from("bios")
        .insert({
          brand_id: brandId,
          version: nextVersion,
          payload: merged,
          score: scoreBio(merged),
          certified: false, // learned drafts are ALWAYS uncertified — human re-certifies
          created_by: null,  // machine-authored (Brandolph learning loop)
        })
        .select("id, version")
        .single();
      if (error) throw new Error(`bios insert failed: ${error.message}`);
      logger.info("BIO learned draft written", { brandId, version: data.version, bioId: data.id, changedCount });
      return data;
    });

    // ── Step 6 · Notify the brand owner to review & re-certify ───
    await step.run("notify-owner", async () => {
      const recipientUserId = await brandOwnerUserId(brandId);
      if (!recipientUserId) return { notified: false, reason: "no addressable owner" };
      await notify({
        recipientUserId,
        kind: "bio.learned",
        title: "Brandolph learned from your work",
        body: `Brandolph proposed ${changedCount} BIO update(s) from your recent work — review & re-certify.`,
        link: "#/team",
        brandId,
      });
      return { notified: true };
    });

    return { changed: changedCount, bioVersion: bioRow.version };
  }
);

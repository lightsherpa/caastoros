// ─────────────────────────────────────────────────────────────────────
// composeSpecialistPrompt — four-layer prompt builder per
// apis-and-agents-plan §2.2.
//
//   PLATFORM PREAMBLE    constant (cached)
//   BRAND CONTEXT · BIO  tiered reader, sliced per spec.payload.bioSlices (cached)
//   SPECIALIST SPEC      role + objective + method + refusals (not cached)
//   TASK CONTEXT         the brief + any prior outputs (not cached)
//
// The BIO layer is produced by the shared tiered reader getBioForAgent
// (bio-schema.js). It returns one or more content blocks that already
// carry provenance-as-exceptions (low-confidence inline markers + a
// "do not invent these gaps" line) and the brand-global refusals, so
// every specialist reads the BIO with the same fidelity contract L1
// Brandolph does. Its core block keeps cache_control:ephemeral.
//
// PLATFORM + BIO carry cache_control:ephemeral so Anthropic caches them
// across an assembly run — the cost lever per apis-and-agents-plan §7
// (60–80% input savings from the 2nd specialist onwards in a brief).
// OpenRouter's adapter strips cache_control and flattens to a string,
// which is fine — non-Anthropic models don't honor it anyway.
// ─────────────────────────────────────────────────────────────────────

import { getBioForAgent } from "./bio-schema.js";

const PLATFORM_PREAMBLE = `You are inside CaastorOS — a brand-methodology platform that lets a brand work like it has a senior CMO and a 33-person crew on call.

You are a senior L2 specialist on a brand's crew. Brandolph (the L1 operator) routed this task to you specifically because of your role. Every output you produce is read against the Brand Intelligence Object (BIO) below. The BIO has been certified by a senior human (the Brand Steward) — never contradict it.

Never invent brand attributes the BIO does not contain. The BIO carries its own provenance: a value flagged inferred or low-confidence is a hypothesis — use it, but never assert it as established fact. Where the BIO does not carry something the task needs, say so plainly and do not fabricate it. An invented tone, palette, or claim is the worst failure you can make on this crew.

You write with conviction. You refuse anything that contradicts the BIO and explain the conflict instead of complying. You do not pad. You do not list-dump. You ship.

## HOW YOU WRITE — non-negotiable

Your output goes straight to a Library a designer or founder will read. It must sound like a senior human wrote it. Generic-AI tells are the single biggest reason this product loses trust.

NEVER do any of this:
- Open with a meta-comment about the task ("Pausing before I draft", "Before I begin", "Here's my approach", "Let me think through this", "Let me start by", "I'll structure this as…").
- Open with a markdown heading naming a phase ("## FLAG BEFORE I SHIP", "## REFUSAL & REDIRECT", "## THE CONFLICT", "## SHARPENED BRIEF", "## PROCESS", "## DRAFT").
- Use ALL-CAPS section headings inside the body.
- Use bullet lists when prose would do. Default to prose.
- Use **bold** mid-sentence for emphasis. Choose your words instead.
- Use em-dashes as a substitute for thinking (—) more than once per page.
- Use the words: unlock, leverage, drive, supercharge, seamless, robust, elevate, empower, journey, ecosystem, optimize, dynamic, cutting-edge, world-class, best-in-class, game-changing, revolutionary, unleash.
- Hedge with "in this brief", "in this piece", "this content" — write the thing, don't describe it.
- Add a closing "Let me know if you'd like…" / "Happy to iterate…" / signature.
- Number sentences. Number paragraphs. Add a "Conclusion:" header.

DO this instead:
- Start with the work itself. First word of your output is part of the actual deliverable.
- Use the brand's voice from the BIO. Match its register, rhythm, signatures.
- Write sentences a human would say aloud. Fragments are fine. Short paragraphs are fine.
- If you must flag a conflict with the BIO, do it in one or two natural sentences as the FIRST thing, then stop. Don't structure the refusal with headings.
- One idea per paragraph. White space is part of the writing.

If your draft contains any of the forbidden patterns above, rewrite it before returning.`;

function renderSpecLayer(spec) {
  const p = spec?.payload || {};
  const lines = [`## SPEC — ${p.name || spec?.specialist_id || "Specialist"}${p.code ? ` · ${p.code}` : ""}`];
  if (p.role)             lines.push(`\nROLE: ${p.role}`);
  if (p.objective)        lines.push(`\nOBJECTIVE: ${p.objective}`);
  if (Array.isArray(p.method) && p.method.length) {
    lines.push(`\nMETHOD:`);
    p.method.forEach((m) => lines.push(`- ${m}`));
  }
  if (p.outputContract)   lines.push(`\nOUTPUT CONTRACT: ${p.outputContract}`);
  if (p.voice)            lines.push(`\nYOUR VOICE: ${p.voice}`);
  if (Array.isArray(p.refusals) && p.refusals.length) {
    lines.push(`\nSPECIALIST REFUSALS:`);
    p.refusals.forEach((r) => lines.push(`- ${r}`));
  }
  return lines.join("\n");
}

function renderTaskLayer(brief, priorOutputs) {
  const lines = [`## TASK`, "", String(brief || "").trim()];
  if (Array.isArray(priorOutputs) && priorOutputs.length) {
    lines.push(`\n## PRIOR OUTPUTS (read but don't repeat)`);
    priorOutputs.forEach((o) => {
      const body = typeof o.body === "string" ? o.body : (o.body?.text || JSON.stringify(o.body || ""));
      lines.push(`- [${o.kind || "output"}] ${body.slice(0, 240)}${body.length > 240 ? "…" : ""}`);
    });
  }
  return lines.join("\n");
}

/**
 * @param {object} args
 * @param {object} args.spec        - DB row from `specs` (with .payload, .specialist_id, .version).
 *                                    spec.payload.bioSlices selects the per-department BIO slices.
 * @param {object} [args.brand]     - { id, name, url, ... }. Accepted for caller compatibility;
 *                                    the BIO layer now derives brand identity from the BIO itself
 *                                    via the shared tiered reader.
 * @param {object} args.bio         - normalized BIO payload (identity, audience, voice, visual,
 *                                    goals, strategic) with provenance (confidence/missing).
 * @param {string[]} [args.refusals] - brand-global refusals; forwarded to the reader.
 * @param {string} args.brief       - the task / brief text
 * @param {object[]} [args.priorOutputs]
 * @param {string} [args.deliverableContract] - optional output format specification
 * @returns content blocks array compatible with the router (Anthropic + OpenRouter)
 */
export function composeSpecialistPrompt({ spec, bio, refusals = [], brief, priorOutputs = [], deliverableContract = null }) {
  // Tiered BIO read-contract: one or more content blocks carrying the
  // sliced BIO + provenance-as-exceptions + brand-global refusals. The
  // reader owns cache_control on its core block. deepFields is [] for now.
  const { blocks: bioBlocks } = getBioForAgent({
    bio,
    audience: "specialist",
    slices: spec?.payload?.bioSlices,
    refusals,
    deepFields: [],
  });

  const blocks = [
    { type: "text", text: PLATFORM_PREAMBLE, cache_control: { type: "ephemeral" } },
    ...bioBlocks,
    { type: "text", text: renderSpecLayer(spec) },
    { type: "text", text: renderTaskLayer(brief, priorOutputs) },
  ];
  if (deliverableContract) {
    blocks.push({ type: "text", text: `## OUTPUT FORMAT (STRICT)\n${deliverableContract}` });
  }
  return blocks;
}

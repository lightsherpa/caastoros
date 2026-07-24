// ─────────────────────────────────────────────────────────────────────
// composeSpecialistPrompt — four-layer prompt builder per
// apis-and-agents-plan §2.2.
//
//   PLATFORM PREAMBLE    constant (cached)
//   BRAND CONTEXT · BIO  sliced per spec.payload.bioSlices (cached)
//   SPECIALIST SPEC      role + objective + method + refusals (not cached)
//   TASK CONTEXT         the brief + any prior outputs (not cached)
//
// PLATFORM + BIO carry cache_control:ephemeral so Anthropic caches them
// across an assembly run — the cost lever per apis-and-agents-plan §7
// (60–80% input savings from the 2nd specialist onwards in a brief).
// OpenRouter's adapter strips cache_control and flattens to a string,
// which is fine — non-Anthropic models don't honor it anyway.
// ─────────────────────────────────────────────────────────────────────

const PLATFORM_PREAMBLE = `You are inside CaastorOS — a brand-methodology platform that lets a brand work like it has a senior CMO and a specialist crew on call.

You are a senior L2 specialist on a brand's crew. Brandolph (the L1 operator) routed this task to you specifically because of your role. Every output you produce is read against the Brand Intelligence Object (BIO) below. The BIO has been certified by a senior human (the Brand Steward) — never contradict it.

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

function renderBioSlice(brand, bio, slices, refusals) {
  const include = Array.isArray(slices) && slices.length > 0
    ? new Set(slices)
    : new Set(["positioning", "voice", "audience"]);

  const lines = [`## BRAND INTELLIGENCE OBJECT — ${brand?.name || "(brand)"} · BIO v${bio?.version ?? "?"}`];

  // Identity is always included — every specialist needs the positioning anchor
  if (bio?.identity?.positioning) lines.push(`POSITIONING: ${bio.identity.positioning}`);
  if (bio?.identity?.category)    lines.push(`CATEGORY: ${bio.identity.category}`);
  if (bio?.identity?.pillars?.length) lines.push(`PILLARS: ${bio.identity.pillars.join(" · ")}`);

  if (include.has("audience") || include.has("positioning")) {
    if (bio?.audience?.primary)    lines.push(`\nPRIMARY AUDIENCE: ${bio.audience.primary}`);
    if (bio?.audience?.secondary)  lines.push(`SECONDARY: ${bio.audience.secondary}`);
    if (bio?.audience?.jtbd?.length) lines.push(`JTBD: ${bio.audience.jtbd.map((j) => `"${j}"`).join(" | ")}`);
  }

  if (include.has("voice")) {
    if (bio?.voice?.register)         lines.push(`\nVOICE REGISTER: ${bio.voice.register}`);
    if (bio?.voice?.rhythm)           lines.push(`RHYTHM: ${bio.voice.rhythm}`);
    if (bio?.voice?.signatures?.length) lines.push(`SIGNATURES: ${bio.voice.signatures.map((s) => `"${s}"`).join(" · ")}`);
  }

  if (include.has("forbidden") || include.has("voice")) {
    if (bio?.voice?.forbidden?.length) lines.push(`\nFORBIDDEN WORDS (never use, no exceptions): ${bio.voice.forbidden.join(", ")}`);
  }

  if (include.has("palette") || include.has("type") || include.has("imagery")) {
    if (bio?.visual?.palette?.length) lines.push(`\nPALETTE: ${bio.visual.palette.map((p) => `${p.name || ""} ${p.hex || ""}`.trim()).join(", ")}`);
    if (bio?.visual?.type?.length)    lines.push(`TYPE: ${bio.visual.type.map((t) => `${t.kind || ""}: ${t.family || ""}`).join(" · ")}`);
    if (bio?.visual?.imagery?.length) lines.push(`IMAGERY: ${bio.visual.imagery.join(" · ")}`);
    if (bio?.visual?.avoid?.length)   lines.push(`AVOID: ${bio.visual.avoid.join(" · ")}`);
  }

  if (bio?.goals?.northStar) lines.push(`\nNORTH STAR: ${bio.goals.northStar}`);

  if (bio?.strategic?.watchouts?.length) {
    lines.push(`\nSTRATEGIC WATCHOUTS`);
    bio.strategic.watchouts.forEach((w) => lines.push(`- ${w}`));
  }

  if (Array.isArray(refusals) && refusals.length) {
    lines.push(`\n## BRAND-GLOBAL REFUSALS (you must not violate)`);
    refusals.forEach((r, i) => lines.push(`${i + 1}. ${r}`));
  }

  return lines.join("\n");
}

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
  if (p.evidenceContract) lines.push(`\nEVIDENCE CONTRACT: ${p.evidenceContract}`);
  const handoffContract = p.handoffContract || p.handoffRequirements;
  if (handoffContract)    lines.push(`\nHANDOFF CONTRACT: ${handoffContract}`);
  if (p.structuredOutput) lines.push(`\nSTRUCTURED OUTPUT (VALID JSON ONLY): ${typeof p.structuredOutput === "string" ? p.structuredOutput : JSON.stringify(p.structuredOutput)}`);
  if (p.voice)            lines.push(`\nYOUR VOICE: ${p.voice}`);
  if (Array.isArray(p.qaGates) && p.qaGates.length) {
    lines.push(`\nQUALITY GATES (check each before shipping):`);
    p.qaGates.forEach((g) => lines.push(`- ${g}`));
  }
  if (Array.isArray(p.refusals) && p.refusals.length) {
    lines.push(`\nSPECIALIST REFUSALS:`);
    p.refusals.forEach((r) => lines.push(`- ${r}`));
  }
  return lines.join("\n");
}

function renderTaskLayer(brief, priorOutputs) {
  const lines = [`## TASK`, "", String(brief || "").trim()];
  if (Array.isArray(priorOutputs) && priorOutputs.length) {
    lines.push(`\n## PRIOR OUTPUTS — AUTHORITATIVE HANDOFFS`);
    lines.push("Treat committed choices, named territories, approved copy, dimensions, and constraints below as upstream decisions. Build from them without paraphrasing them back. Preserve exact names and claims. If two handoffs conflict, name the conflict briefly and follow the BIO plus the newest explicit decision.");
    priorOutputs.forEach((o) => {
      const body = typeof o.body === "string" ? o.body : (o.body?.text || JSON.stringify(o.body || ""));
      const owner = o.specialist_id ? ` · ${o.specialist_id}` : "";
      lines.push(`\n### ${o.kind || "output"}${owner}\n${body.slice(0, 1600)}${body.length > 1600 ? "…" : ""}`);
    });
    lines.push("\nYour output must make the next specialist's job easier: state final choices unambiguously and include every field required by your HANDOFF CONTRACT.");
  }
  return lines.join("\n");
}

/**
 * @param {object} args
 * @param {object} args.spec        - DB row from `specs` (with .payload, .specialist_id, .version)
 * @param {object} args.brand       - { id, name, url, ... }
 * @param {object} args.bio         - BIO payload (identity, audience, voice, visual, goals, strategic) + version/score
 * @param {string[]} [args.refusals]
 * @param {string} args.brief       - the task / brief text
 * @param {object[]} [args.priorOutputs]
 * @param {string} [args.deliverableContract] - optional output format specification
 * @returns content blocks array compatible with the router (Anthropic + OpenRouter)
 */
export function composeSpecialistPrompt({ spec, brand, bio, refusals = [], brief, priorOutputs = [], deliverableContract = null }) {
  const blocks = [
    { type: "text", text: PLATFORM_PREAMBLE, cache_control: { type: "ephemeral" } },
    { type: "text", text: renderBioSlice(brand, bio, spec?.payload?.bioSlices, refusals), cache_control: { type: "ephemeral" } },
    { type: "text", text: renderSpecLayer(spec) },
    { type: "text", text: renderTaskLayer(brief, priorOutputs) },
  ];
  if (deliverableContract) {
    blocks.push({ type: "text", text: `## OUTPUT FORMAT (STRICT)\n${deliverableContract}` });
  }
  return blocks;
}

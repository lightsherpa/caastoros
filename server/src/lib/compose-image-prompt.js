// ─────────────────────────────────────────────────────────────────────
// Image prompt composer — flattens the brand's visual identity + the
// brief into a single concise prompt string for image generators.
//
// Image models (Flux, Recraft, etc.) take ONE text prompt, not the
// four-layer message structure text LLMs use. So we collapse the
// BIO's visual slice + the spec's role + the brief into ~80–150 words
// of dense, descriptive language — what a senior art director would
// write on a brief.
// ─────────────────────────────────────────────────────────────────────

export function composeImagePrompt({ spec, brand, bio, refusals = [], brief, sourceText = null }) {
  const v = bio?.visual || {};
  const lines = [];

  /* Lead with the task — what to depict. */
  lines.push(String(brief || "").trim());

  /* When this image illustrates a specific copy deliverable (a social post
     caption, a blog hero), depict its subject — never typeset the words. */
  if (sourceText) {
    lines.push(`The image accompanies this copy: "${String(sourceText).slice(0, 240)}". Depict its subject and mood; do not render the text itself.`);
  }

  /* Spec role — what KIND of image (hero, editorial, identity, etc.) */
  const role = spec?.payload?.role || spec?.payload?.objective || "";
  if (role) lines.push(`Style direction: ${role}.`);

  /* Brand's visual palette + type + imagery cues */
  if (v.palette?.length) {
    const pal = v.palette.map((p) => `${p.name || ""} ${p.hex || ""}`.trim()).filter(Boolean).join(", ");
    if (pal) lines.push(`Palette: ${pal}.`);
  }
  if (v.imagery?.length) {
    lines.push(`Imagery direction: ${v.imagery.join("; ")}.`);
  }
  if (v.avoid?.length) {
    lines.push(`AVOID at all costs: ${v.avoid.join("; ")}.`);
  }

  /* Brand voice as visual register — editorial vs playful, etc. */
  if (bio?.voice?.register) {
    lines.push(`Visual register matches the brand voice: ${bio.voice.register}.`);
  }

  /* Pillars / positioning to anchor the feeling */
  if (bio?.identity?.positioning) lines.push(`Brand positioning: ${bio.identity.positioning}`);
  if (bio?.identity?.pillars?.length) lines.push(`Brand pillars: ${bio.identity.pillars.join(", ")}.`);

  /* Refusals as explicit don'ts */
  if (Array.isArray(refusals) && refusals.length) {
    lines.push(`Do NOT include any of: ${refusals.slice(0, 5).join(" | ")}.`);
  }

  /* Always include a quality nudge */
  lines.push("Editorial-grade composition. High craft. Real-world plausibility.");

  return lines.join(" ");
}

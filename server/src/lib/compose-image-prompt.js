// Image generators receive one flat string, so this composer turns the brief,
// specialist intent, and BIO into a compact, production-ready art brief.

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function list(values, separator = "; ") {
  if (!Array.isArray(values)) return "";
  return values.map(clean).filter(Boolean).join(separator);
}

function firstValue(...values) {
  return values.map(clean).find(Boolean) || "";
}

function outputDirection(payload, role) {
  const output = payload?.output && typeof payload.output === "object" ? payload.output : {};
  const width = payload?.dimensions?.width || payload?.dimensions?.w;
  const height = payload?.dimensions?.height || payload?.dimensions?.h;
  const dimensions = payload?.dimensions && typeof payload.dimensions === "object"
    ? (width && height ? `${width}x${height}` : "")
    : payload?.dimensions;
  const format = firstValue(payload?.outputFormat, payload?.format, output?.format, "high-resolution image");
  const crop = firstValue(payload?.crop, output?.crop, "full-bleed crop");
  let aspect = firstValue(payload?.aspectRatio, payload?.aspect_ratio, output?.aspectRatio, output?.aspect_ratio, dimensions);

  if (!aspect) {
    if (/hero|banner|blog|editorial|key visual/i.test(role)) aspect = "16:9 landscape";
    else if (/story|reel|vertical/i.test(role)) aspect = "9:16 portrait";
    else if (/social|post|identity|mood/i.test(role)) aspect = "1:1 square";
    else aspect = "4:3 landscape";
  }

  return `${format}; ${crop}; ${aspect}; compose for the final crop with no critical subject matter at the edges`;
}

function cameraDirection(payload, role) {
  const explicit = firstValue(payload?.camera, payload?.viewpoint, payload?.lens);
  if (explicit) return explicit;
  if (/pack|packaging|product|still life/i.test(role)) return "three-quarter product viewpoint with an 85mm-equivalent lens, disciplined perspective, and precise edge definition";
  if (/lifestyle|editorial|documentary/i.test(role)) return "observational eye-level viewpoint with a 35mm-equivalent lens, natural perspective, and layered environmental depth";
  if (/identity|mood|art direction/i.test(role)) return "deliberate straight-on or orthographic viewpoint with a 65mm-equivalent lens and graphic spatial relationships";
  return "eye-level viewpoint with a 50mm-equivalent natural perspective, believable depth, and restrained depth of field";
}

function brandEvidence({ brand, bio, visual }) {
  const evidence = [];
  const name = firstValue(brand?.name, bio?.identity?.name);
  if (name) evidence.push(`${name} brand world`);
  if (bio?.identity?.positioning) evidence.push(clean(bio.identity.positioning));
  if (bio?.identity?.pillars?.length) evidence.push(`pillars: ${list(bio.identity.pillars, ", ")}`);
  if (visual.imagery?.length) evidence.push(`recognizable imagery cues: ${list(visual.imagery)}`);
  return evidence.join("; ");
}

export function composeImagePrompt({ spec, brand, bio, refusals = [], brief, sourceText = null, artDirection = null }) {
  const visual = bio?.visual || {};
  const payload = spec?.payload || {};
  const role = firstValue(payload.role, payload.objective, "brand image");
  const subject = clean(artDirection) || clean(brief) || clean(sourceText) || role;
  const prompt = [];

  prompt.push(`SUBJECT & ACTION: ${subject}. Make the primary subject and its action immediately legible; show a specific moment, not a generic theme.`);

  if (artDirection) {
    prompt.push(`ART DIRECTION — FOLLOW PRECISELY: ${clean(artDirection)}. Do not render any text in the image.`);
  }

  if (sourceText) {
    prompt.push(`COPY CONTEXT: The image accompanies this copy: "${clean(sourceText).slice(0, 240)}". Depict the copy's subject, emotional beat, and implied world; do not render the text itself, typeset it, or quote it.`);
  }

  const composition = firstValue(payload?.composition, "one unmistakable focal point, clear foreground/midground/background separation, controlled visual rhythm, and intentional negative space");
  prompt.push(`COMPOSITION & HIERARCHY: ${composition}, appropriate to ${role}.`);
  prompt.push(`CAMERA / VIEWPOINT: ${cameraDirection(payload, role)}; follow a more specific supplied art direction when present.`);
  const lighting = firstValue(payload?.lighting, visual?.lighting, "motivated, directional natural light with shaped highlights and shadows, dimensional contrast, and no flat studio wash");
  prompt.push(`LIGHT: ${lighting}.`);
  const materials = firstValue(payload?.materials, payload?.texture, visual?.materials, "physically credible surfaces, tactile micro-texture, natural imperfections, accurate reflections, and realistic contact shadows; avoid synthetic CGI smoothness");
  prompt.push(`MATERIAL & TEXTURE: ${materials}.`);

  const palette = (visual.palette || [])
    .map((color) => `${clean(color?.name)} ${clean(color?.hex)}`.trim())
    .filter(Boolean)
    .join(", ");
  prompt.push(`PALETTE: ${palette || "a restrained, coherent palette derived from the subject and environment"}; preserve color separation and natural skin/product tones where applicable.`);

  const imagery = list(visual.imagery);
  const environment = firstValue(payload?.environment, imagery, "a specific, plausible real-world setting with purposeful contextual details");
  prompt.push(`ENVIRONMENT: ${environment}; every prop and background element must support the story.`);

  const evidence = brandEvidence({ brand, bio, visual });
  prompt.push(`BRAND EVIDENCE: ${evidence || "express the brand through consistent art direction, distinctive details, and a repeatable visual point of view"}. Show evidence through subject, styling, palette, and setting rather than unsupported logos or invented packaging.`);

  if (bio?.voice?.register) {
    prompt.push(`VISUAL REGISTER: ${clean(bio.voice.register)}.`);
  }

  prompt.push(`OUTPUT: ${outputDirection(payload, role)}.`);

  const negatives = [
    ...(Array.isArray(visual.avoid) ? visual.avoid : []),
    ...(Array.isArray(refusals) ? refusals.slice(0, 8) : []),
  ].map(clean).filter(Boolean);
  const uniqueNegatives = [...new Set(negatives)];
  prompt.push(`NEGATIVE CONSTRAINTS: No text, typography, captions, watermarks, signatures, or UI; no invented logos or illegible pseudo-lettering; no generic stock-photo staging; no clutter competing with the focal subject; no distorted anatomy, duplicate objects, warped geometry, plastic skin, oversharpening, or excessive HDR${uniqueNegatives.length ? `; also exclude: ${uniqueNegatives.join(" | ")}` : ""}.`);

  prompt.push("FINISH: Editorial-grade composition, production-ready detail, high craft, and real-world plausibility.");

  return prompt.join(" ");
}

// extract-visual-deterministic.js
//
// Increment 4 (Visual extraction) — the DETERMINISTIC, $0 half.
// Palette + fonts are parsed straight from the page's raw HTML/CSS. No network,
// no LLM, no new deps — regex/string only. LLMs are unreliable at exact hex, so
// we never use vision here (vision is reserved for imagery + "avoid" elsewhere).
//
// FROZEN CONTRACT (other agents import these):
//   extractPalette(rawHtml = "") -> Array<{ hex: "#rrggbb", name: string }>
//   extractFonts(rawHtml = "")   -> Array<{ kind: "Display"|"Body", family: string }>

// ---------------------------------------------------------------------------
// Named-color table — small, common, intentionally not exhaustive.
// Nearest match is by plain RGB euclidean distance.
// ---------------------------------------------------------------------------
const NAMED_COLORS = [
  { name: "black", rgb: [0, 0, 0] },
  { name: "white", rgb: [255, 255, 255] },
  { name: "charcoal", rgb: [54, 54, 54] },
  { name: "slate", rgb: [112, 128, 144] },
  { name: "red", rgb: [220, 38, 38] },
  { name: "orange", rgb: [234, 88, 12] },
  { name: "amber", rgb: [217, 158, 0] },
  { name: "yellow", rgb: [250, 204, 21] },
  { name: "green", rgb: [22, 163, 74] },
  { name: "teal", rgb: [13, 148, 136] },
  { name: "blue", rgb: [37, 99, 235] },
  { name: "indigo", rgb: [67, 56, 202] },
  { name: "purple", rgb: [147, 51, 234] },
  { name: "pink", rgb: [236, 72, 153] },
  { name: "brown", rgb: [120, 72, 40] },
  { name: "cream", rgb: [245, 240, 220] },
];

function nearestName([r, g, b]) {
  let best = NAMED_COLORS[0];
  let bestDist = Infinity;
  for (const c of NAMED_COLORS) {
    const dr = r - c.rgb[0];
    const dg = g - c.rgb[1];
    const db = b - c.rgb[2];
    const dist = dr * dr + dg * dg + db * db;
    if (dist < bestDist) {
      bestDist = dist;
      best = c;
    }
  }
  return best.name;
}

const HEX_RE = /^#[0-9a-f]{6}$/;

function hexToRgb(hex) {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

// Normalize any supported color token to "#rrggbb" lowercase, or null.
function normalizeColor(token) {
  if (!token) return null;
  const t = token.trim().toLowerCase();

  // #rgb or #rrggbb
  const hexMatch = t.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (hexMatch) {
    let h = hexMatch[1];
    if (h.length === 3) {
      h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    }
    return "#" + h;
  }

  // rgb(r,g,b) / rgba(r,g,b,a) — drop alpha
  const rgbMatch = t.match(
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*[\d.]+\s*)?\)$/
  );
  if (rgbMatch) {
    const r = Math.round(Number(rgbMatch[1]));
    const g = Math.round(Number(rgbMatch[2]));
    const b = Math.round(Number(rgbMatch[3]));
    if ([r, g, b].some((n) => Number.isNaN(n) || n < 0 || n > 255)) return null;
    const to2 = (n) => n.toString(16).padStart(2, "0");
    return "#" + to2(r) + to2(g) + to2(b);
  }

  return null;
}

// Near-pure white: every channel >= 0xf5 (245). Near-pure black: every channel <= 0x0a (10).
function isNearWhite([r, g, b]) {
  return r >= 0xf5 && g >= 0xf5 && b >= 0xf5;
}
function isNearBlack([r, g, b]) {
  return r <= 0x0a && g <= 0x0a && b <= 0x0a;
}

/**
 * Collect colors from inline styles, <style> blocks, and CSS custom properties.
 * Frequency-rank, dedupe, drop near-pure-white/black unless top-2, keep top 5,
 * and name each via the local nearest-color table.
 */
export function extractPalette(rawHtml = "") {
  if (typeof rawHtml !== "string" || rawHtml.length === 0) return [];

  const counts = new Map();

  // Match any hex / rgb() / rgba() token anywhere in the HTML+CSS text.
  // This naturally covers inline style="", <style> blocks, and `--var: <color>`.
  const tokenRe = /#[0-9a-fA-F]{3,6}\b|rgba?\([^)]*\)/g;
  const tokens = rawHtml.match(tokenRe) || [];

  for (const tok of tokens) {
    const hex = normalizeColor(tok);
    if (!hex || !HEX_RE.test(hex)) continue;
    counts.set(hex, (counts.get(hex) || 0) + 1);
  }

  // Sort by frequency desc, then stable-ish by hex for determinism.
  const ranked = [...counts.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0;
  });

  const result = [];
  for (let i = 0; i < ranked.length; i++) {
    const [hex] = ranked[i];
    const rgb = hexToRgb(hex);
    const top2 = i < 2;
    if (!top2 && (isNearWhite(rgb) || isNearBlack(rgb))) continue;
    result.push({ hex, name: nearestName(rgb) });
    if (result.length >= 5) break;
  }

  return result.filter((e) => HEX_RE.test(e.hex));
}

// ---------------------------------------------------------------------------
// Fonts
// ---------------------------------------------------------------------------

// Families we never report as a brand font (generics + ubiquitous fallbacks).
const GENERIC_FAMILIES = new Set([
  "serif",
  "sans-serif",
  "monospace",
  "system-ui",
  "ui-sans-serif",
  "ui-serif",
  "ui-monospace",
  "-apple-system",
  "blinkmacsystemfont",
  "arial",
  "helvetica",
  "helvetica neue",
  "times",
  "times new roman",
  "georgia",
  "courier",
  "courier new",
  "segoe ui",
  "roboto",
  "inherit",
  "initial",
  "unset",
]);

function cleanFamilyName(raw) {
  if (!raw) return null;
  let f = raw.trim().replace(/^['"]|['"]$/g, "").trim();
  if (!f) return null;
  if (GENERIC_FAMILIES.has(f.toLowerCase())) return null;
  return f;
}

// Pull the first non-generic family out of a font-family stack string.
function firstRealFamily(stack) {
  if (!stack) return null;
  for (const part of stack.split(",")) {
    const fam = cleanFamilyName(part);
    if (fam) return fam;
  }
  return null;
}

/**
 * Extract up to ~3 brand fonts from rawHtml.
 * - @font-face { font-family } and font-family stacks on heading/display rules → Display
 * - font-family stacks on body rules → Body
 * - Google-Fonts / Adobe-Typekit <link href> family names → fallback fonts
 * Generic / fallback-only families are skipped. Deduped by family.
 * Heuristic: first family found in a heading/display context is Display,
 * first in a body context is Body.
 */
export function extractFonts(rawHtml = "") {
  if (typeof rawHtml !== "string" || rawHtml.length === 0) return [];

  let display = null;
  let body = null;
  const linkFamilies = [];

  // --- Heading / display context: h1..h6 rules ---
  const headingRuleRe =
    /\b(?:h[1-6]|\.display|\.headline|\.hero)[^{}]*\{[^{}]*font-family\s*:\s*([^;}]+)[;}]/gi;
  let m;
  while ((m = headingRuleRe.exec(rawHtml)) !== null) {
    const fam = firstRealFamily(m[1]);
    if (fam) {
      display = fam;
      break;
    }
  }

  // --- Body context: body / html rules ---
  const bodyRuleRe =
    /\b(?:body|html)\b[^{}]*\{[^{}]*font-family\s*:\s*([^;}]+)[;}]/gi;
  while ((m = bodyRuleRe.exec(rawHtml)) !== null) {
    const fam = firstRealFamily(m[1]);
    if (fam) {
      body = fam;
      break;
    }
  }

  // --- @font-face families (candidate display fonts if nothing else) ---
  const fontFaceFamilies = [];
  const fontFaceRe = /@font-face\s*\{[^{}]*font-family\s*:\s*([^;}]+)[;}]/gi;
  while ((m = fontFaceRe.exec(rawHtml)) !== null) {
    const fam = cleanFamilyName(m[1]);
    if (fam) fontFaceFamilies.push(fam);
  }

  // --- Google Fonts / Adobe Typekit <link href> family names ---
  const linkRe = /<link\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi;
  while ((m = linkRe.exec(rawHtml)) !== null) {
    const href = m[1];
    // Google Fonts: ?family=Family+Name:wght@... | &family=Other
    if (/fonts\.googleapis\.com/i.test(href)) {
      const famRe = /[?&]family=([^&:]+)/gi;
      let fm;
      while ((fm = famRe.exec(href)) !== null) {
        const fam = cleanFamilyName(decodeURIComponent(fm[1].replace(/\+/g, " ")));
        if (fam) linkFamilies.push(fam);
      }
    }
    // Adobe Typekit / use.typekit.net — family name is not reliably in the URL;
    // surface the kit only if a data-family-ish hint is absent. Skip silently otherwise.
  }

  // Fill gaps from @font-face / link families.
  const fallbacks = [...fontFaceFamilies, ...linkFamilies];
  if (!display && fallbacks.length) display = fallbacks[0];
  if (!body && fallbacks.length) {
    body = fallbacks.find((f) => f !== display) || null;
  }

  const out = [];
  const seen = new Set();
  const push = (kind, family) => {
    if (!family) return;
    const key = family.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ kind, family });
  };

  push("Display", display);
  push("Body", body);

  // If we still have room and unused families, add one more (as Body).
  if (out.length < 3) {
    for (const fam of fallbacks) {
      if (out.length >= 3) break;
      push("Body", fam);
    }
  }

  return out.slice(0, 3);
}

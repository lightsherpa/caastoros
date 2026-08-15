// Pure guards for untrusted client input at the ingest boundary.
//  - validateUpload: MIME/size/extension allow-list for evidence uploads,
//    so a huge or executable file can't be buffered into memory or parsed
//    by the compiler.
//  - assertPublicUrl: block SSRF (file://, localhost, RFC1918, link-local,
//    cloud metadata 169.254.169.254) before any server-side fetch/scrape
//    of a client-supplied URL.
// No I/O — testable with case tables.

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15 MB

// Documents the compiler can read + images for the visual bucket.
export const ALLOWED_UPLOAD_EXTS = new Set([
  "pdf", "txt", "md", "markdown", "doc", "docx", "rtf", "csv",
  "png", "jpg", "jpeg", "webp", "gif", "svg",
]);
const ALLOWED_MIME_PREFIXES = ["text/", "image/"];
const ALLOWED_MIME_EXACT = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/rtf",
  "application/octet-stream", // some browsers send this for docs; the extension is the real gate
  "",
]);

/**
 * @param {{ mime?: string, size?: number, filename?: string }} f
 * @returns {{ ok: true, ext: string } | { ok: false, code: string, message: string }}
 */
export function validateUpload({ mime = "", size = 0, filename = "" } = {}) {
  if (!Number.isFinite(size) || size <= 0) return { ok: false, code: "EMPTY", message: "Empty file" };
  if (size > MAX_UPLOAD_BYTES) {
    return { ok: false, code: "TOO_LARGE", message: `File exceeds ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB` };
  }
  const ext = filename.includes(".") ? filename.split(".").pop().toLowerCase() : "";
  const m = String(mime || "").toLowerCase();
  if (!ALLOWED_UPLOAD_EXTS.has(ext)) return { ok: false, code: "EXT", message: `Unsupported file type .${ext || "?"}` };
  const mimeOk = ALLOWED_MIME_EXACT.has(m) || ALLOWED_MIME_PREFIXES.some((p) => m.startsWith(p));
  if (!mimeOk) return { ok: false, code: "MIME", message: `Unsupported content-type ${m}` };
  return { ok: true, ext };
}

const PRIVATE_V4 = [
  /^127\./, /^10\./, /^192\.168\./, /^169\.254\./, /^0\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
];

/**
 * Throws (with .code) if the URL is not a public http(s) endpoint.
 * ponytail: literal-host guard only — add a DNS-resolve-then-check layer
 * if we ever fetch a client URL from our OWN network (today scraping goes
 * through Firecrawl, an external service).
 * @returns {string} the normalized href when public
 */
export function assertPublicUrl(raw) {
  let u;
  try { u = new URL(String(raw)); }
  catch { const e = new Error("Invalid URL"); e.code = "BAD_URL"; throw e; }

  if (u.protocol !== "http:" && u.protocol !== "https:") {
    const e = new Error(`Blocked URL scheme ${u.protocol}`); e.code = "BAD_SCHEME"; throw e;
  }
  const host = u.hostname.toLowerCase();
  // WHATWG URL keeps IPv6 hosts bracketed ("[::1]") — strip for IP checks.
  const bare = host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
  if (host === "localhost" || bare === "0.0.0.0" || host.endsWith(".localhost") || host.endsWith(".internal")) {
    const e = new Error("Blocked internal host"); e.code = "PRIVATE_HOST"; throw e;
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(bare) && PRIVATE_V4.some((re) => re.test(bare))) {
    const e = new Error("Blocked private IP"); e.code = "PRIVATE_IP"; throw e;
  }
  if (bare === "::1" || bare.startsWith("fc") || bare.startsWith("fd") || bare.startsWith("fe80")) {
    const e = new Error("Blocked private IPv6"); e.code = "PRIVATE_IP"; throw e;
  }
  return u.href;
}

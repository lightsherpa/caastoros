// Inline local <img> assets as base64 data URIs so the HTML is self-contained
// for the Adobe Express importer (which can't fetch local relative paths from
// inline HTML). Inline <svg> and Google Fonts links are left as-is.
//
// Usage: node scripts/inline-explainer-assets.mjs [in.html] [out.html]
// ponytail: handles <img src="local.png">. data: URIs and http(s) URLs are skipped.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const inPath = process.argv[2] ?? 'CaastorOS/2026-06-25-explainer-90s.html';
const outPath = process.argv[3] ?? inPath.replace(/\.html$/, '.selfcontained.html');

const mime = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', svg: 'image/svg+xml', gif: 'image/gif', webp: 'image/webp' };
const base = dirname(resolve(inPath));
let html = readFileSync(inPath, 'utf8');
let inlined = 0, missing = [];

html = html.replace(/(<img\b[^>]*\bsrc=")([^"]+)(")/g, (m, pre, src, post) => {
  if (/^(data:|https?:)/i.test(src)) return m;
  const file = resolve(base, src);
  if (!existsSync(file)) { missing.push(src); return m; }
  const ext = src.split('.').pop().toLowerCase();
  const b64 = readFileSync(file).toString('base64');
  inlined++;
  return `${pre}data:${mime[ext] ?? 'application/octet-stream'};base64,${b64}${post}`;
});

writeFileSync(outPath, html);
console.log(`Inlined ${inlined} asset(s) -> ${outPath}`);
if (missing.length) console.log(`MISSING (left as-is): ${missing.join(', ')}`);
if (inlined === 0 && missing.length === 0) console.log('No local <img> assets found.');

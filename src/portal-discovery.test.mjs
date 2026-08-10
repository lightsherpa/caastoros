import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const discoveryUrl = new URL("./portal-discovery.jsx", import.meta.url);
const sharedUrl = new URL("./portal-shared.jsx", import.meta.url);

test("Discovery imports the shared Brandolph message it renders", async () => {
  const [discoverySource, sharedSource] = await Promise.all([
    readFile(discoveryUrl, "utf8"),
    readFile(sharedUrl, "utf8"),
  ]);

  assert.match(
    discoverySource,
    /import\s*\{\s*BrandolphLine\s*\}\s*from\s*["']\.\/portal-shared\.jsx["']/,
  );
  assert.match(sharedSource, /export\s+function\s+BrandolphLine\s*\(/);
});

test("the Discovery completion message renders without a missing component", async (t) => {
  globalThis.window = {
    CI_USER: { name: "Test operator", avatar: "" },
    matchMedia: () => ({ matches: true }),
  };

  const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  t.after(async () => {
    await vite.close();
    delete globalThis.window;
  });

  const { BrandolphLine } = await vite.ssrLoadModule("/src/portal-shared.jsx");
  const markup = renderToStaticMarkup(
    React.createElement(BrandolphLine, {
      html: "*I've compiled the candidate BIO.* Unsupported claims stay out of the canon.",
    }),
  );

  assert.match(markup, /Brandolph/);
  assert.match(markup, /compiled the candidate BIO/);
});

test("the BIO evidence flow uses a real document picker and multipart upload", async () => {
  const source = await readFile(discoveryUrl, "utf8");

  assert.match(source, /type="file" accept=\{SOURCE_FILE_ACCEPT\}/);
  assert.match(source, /new FormData\(\)/);
  assert.match(source, /sources\/upload/);
  assert.match(source, /fileRef\.current\?\.click\(\)/);
  assert.doesNotMatch(source, /addReference\("Document upload · brand-deck\.pdf"/);
});

test("pending evidence must be incorporated before human review", async () => {
  const source = await readFile(discoveryUrl, "utf8");

  assert.match(source, /hasUnappliedSourceChanges/);
  assert.match(source, /Update the BIO with pending evidence before requesting review/);
  assert.match(source, /Update BIO/);
  assert.match(source, /Review the changes before requesting certification/);
});

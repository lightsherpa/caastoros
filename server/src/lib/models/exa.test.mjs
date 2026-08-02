import { test } from "node:test";
import assert from "node:assert/strict";
import { extractQuery, formatResults } from "./exa.js";

test("extractQuery returns the last non-assistant message content", () => {
  assert.equal(extractQuery([{ role: "user", content: "scan acme.com" }]), "scan acme.com");
  assert.equal(
    extractQuery([{ role: "user", content: "first" }, { role: "assistant", content: "mid" }, { role: "user", content: "map competitors" }]),
    "map competitors",
  );
  assert.equal(extractQuery([]), "");
  assert.equal(extractQuery(null), "");
});

test("extractQuery flattens array (multimodal) content", () => {
  assert.equal(extractQuery([{ role: "user", content: [{ type: "text", text: "a" }, { type: "text", text: "b" }] }]), "a b");
});

test("formatResults renders a markdown brief with title/url/summary", () => {
  const out = formatResults({
    results: [{ title: "Acme", url: "https://acme.com", summary: "A widget maker." }],
    costDollars: { total: 0.005 },
  }, "acme");
  assert.match(out, /Acme/);
  assert.match(out, /https:\/\/acme\.com/);
  assert.match(out, /widget maker/);
  assert.match(out, /1 sources/);
});

test("formatResults handles empty results", () => {
  assert.match(formatResults({ results: [] }, "nothing"), /No web results/);
  assert.match(formatResults({}, "nothing"), /No web results/);
});

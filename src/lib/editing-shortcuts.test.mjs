import { test } from "node:test";
import assert from "node:assert/strict";
import { handleComposerKeyDown } from "./editing-shortcuts.js";

function eventFor(key, modifier = "metaKey") {
  const calls = { prevented: 0, stopped: 0 };
  return {
    calls,
    event: {
      key,
      [modifier]: true,
      preventDefault: () => { calls.prevented += 1; },
      stopPropagation: () => { calls.stopped += 1; },
    },
  };
}

for (const key of ["a", "c", "v"]) {
  test(`Cmd+${key.toUpperCase()} remains a native editing shortcut`, () => {
    const { event, calls } = eventFor(key);
    let submitted = 0;
    assert.equal(handleComposerKeyDown(event, () => { submitted += 1; }), false);
    assert.equal(calls.prevented, 0, "native browser behavior must not be cancelled");
    assert.equal(calls.stopped, 1, "app-level shortcuts must not intercept the key");
    assert.equal(submitted, 0);
  });
}

test("Ctrl+V remains native for non-Mac keyboards", () => {
  const { event, calls } = eventFor("V", "ctrlKey");
  handleComposerKeyDown(event);
  assert.equal(calls.prevented, 0);
  assert.equal(calls.stopped, 1);
});

test("Cmd+Enter submits without inserting a newline", () => {
  const { event, calls } = eventFor("Enter");
  let submitted = 0;
  assert.equal(handleComposerKeyDown(event, () => { submitted += 1; }), true);
  assert.equal(calls.prevented, 1);
  assert.equal(calls.stopped, 1);
  assert.equal(submitted, 1);
});

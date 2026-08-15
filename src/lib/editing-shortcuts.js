const NATIVE_EDITING_KEYS = new Set(["a", "c", "v", "x", "z"]);

/* Keep the operating system's editing contract inside the brief composer.
   We stop app-level shortcuts from seeing these keystrokes, but deliberately
   never preventDefault(), so select all, copy, paste, cut, and undo stay native. */
export function handleComposerKeyDown(event, onSubmit) {
  if (!event || (!event.metaKey && !event.ctrlKey)) return false;

  const key = String(event.key || "").toLowerCase();
  if (NATIVE_EDITING_KEYS.has(key)) {
    event.stopPropagation?.();
    return false;
  }

  if (key === "enter") {
    event.preventDefault?.();
    event.stopPropagation?.();
    onSubmit?.();
    return true;
  }

  return false;
}

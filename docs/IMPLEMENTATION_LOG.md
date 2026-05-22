# CaastorOS — Implementation Log

Append-only. Format: `| DATE | TASK | WHAT WAS BUILT | DIVERGENCE + REASON |`

| DATE | TASK | WHAT WAS BUILT | DIVERGENCE + REASON |
|------|------|----------------|---------------------|
| 2026-05-22 | IA nav reorg (ia-plan.md) | `portal-shell.jsx`: added `section` field to `CLIENT_ROUTES`, grouped sidebar eyebrows, demoted `discovery` from nav (route guard patched), renamed `home` → "Create", `bio` active highlight on discovery route. | None — matches ia-plan.md §5 exactly. |
| 2026-05-22 | Wire HomeCreate brief→ship loop | `portal-brandolph.jsx` `HomeCreate`: added `phase` state (idle → sharpening → proposing → running → done), `handleStart` / `handleProceed` / `handleRun` / `handleReset` handlers, `⌘+↵` keyboard shortcut, review panel renders `BrandolphDiagnosis` then inline assembly grid with live `dot-state` indicators, "Assembling…" spinner (2.8 s timeout), `OutputsReady` on completion. Dashboard (In flight, Try something, Brandolph watching) hides while review is active and restores on reset. | Inline assembly card is a new layout (not `AssemblyPanel` sidebar) — `AssemblyPanel` is height:100% and sidebar-optimised; reusing it inline would break layout. Inline card shares the same data (`getAssembly`) and `dot-state` classes. |

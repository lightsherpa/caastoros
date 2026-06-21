# Canvas Delivery Plan — Plan 3: Canvas Fan-out (client, ADDITIVE)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** When a brief produces N deliverables, the canvas shows N individually-selectable child cards branching off the specialist — without changing any existing canvas behavior.

**Architecture (ADDITIVE ONLY):** Every change is a guarded addition that lights up only when a specialist run returns a `deliverables` array (Plan 2's new output shape). No existing structure is rewritten. A run with no `deliveryPlan` behaves byte-for-byte as today.

**Tech Stack:** React 18 (no test runner). Verification is **live + visual** — the app must be running (`npm run dev:all`); each task ends with a concrete on-screen check. JS validity is gated with `node --check` / the Vite build not breaking.

---

## Preservation contract — these are NOT touched

- `InteractiveCanvas` (the pan/zoom/drag engine, dot grid, fit/zoom/export toolbar, `onNodeClick` wiring) — **zero changes**. Child cards are ordinary nodes it already knows how to render.
- `CanvasHeader` — unchanged (standing rule: never remove it).
- The BIO → Brief → Specialist node graph, the floating **Run** button, `SpecialistNotepad`, `buildInitialRunNodes/Edges`, the existing `renderNode` branches for `bio`/`brief`/`specialist` — all unchanged.
- `streamSpecialistRun`'s existing params and behavior — unchanged (we add ONE optional field).
- Any run without a `deliveryPlan` / `deliverableSpec` → identical to today.

If a step would change any of the above beyond an additive guard, STOP and report it.

---

## File Structure

| File | Change |
|------|--------|
| `src/portal-brandolph.jsx` | +1 field: write `deliveryPlan` into `ci_run_context` (`handleProceed`). |
| `src/portal-briefs.jsx` | Add `deliverableSpec` to `streamSpecialistRun`; add `deliverableSpecForAgent` + `buildDeliverableChildNodes` helpers; additive branch in `runAssembly`; one `deliverable` case in both `renderNode`s; per-card select/export state; `BriefViewCanvas` hydration. |

---

## Task 1: Carry the Delivery Plan to the canvas + accept `deliverableSpec`

**Files:** `src/portal-brandolph.jsx`, `src/portal-briefs.jsx`

- [ ] **Step 1: Brandolph handoff carries the plan.** In `portal-brandolph.jsx`, in `handleProceed`'s `ctx` object (which already has `specialistIds`, `totalCr`, etc.), add one line:

```js
      specialistIds: realAssembly.agents.map((a) => a.id),
      deliveryPlan:  sharp.data?.deliveryPlan || null,
      totalCr:       realAssembly.totalCr,
```

- [ ] **Step 2: `streamSpecialistRun` forwards `deliverableSpec`.** In `portal-briefs.jsx`, add `deliverableSpec` to the destructured params and the request body. The function signature line:

```js
async function streamSpecialistRun({ specialistId, briefText, brandId, briefId, briefMeta, modelOverride, revisionFeedback, deliverableSpec, onToken, onProgress, onQa, onDone, onError, __body }) {
```
and the body object:
```js
  const body = { specialistId, briefText, brandId, briefId, briefMeta, modelOverride, revisionFeedback, deliverableSpec, ...(__body || {}) };
```
(Everything else in the function is unchanged — `deliverableSpec` is `undefined` for every existing caller, so the JSON simply omits it.)

- [ ] **Step 3: Verify (build doesn't break).**

Run: `node --check src/portal-brandolph.jsx && node --check src/portal-briefs.jsx`
Expected: exit 0 (note: JSX may not pass `node --check`; if it errors on JSX syntax, instead confirm the Vite dev server hot-reloads without a red overlay — see live check).

Live check: with the app up, open the Brandolph flow, assemble a crew, click through to the canvas. The canvas opens exactly as before (no visual change yet). In devtools, `JSON.parse(sessionStorage.ci_run_context)` now includes a `deliveryPlan` key.

- [ ] **Step 4: Commit**

```bash
git add src/portal-brandolph.jsx src/portal-briefs.jsx
git commit -m "feat(canvas): carry deliveryPlan to canvas + forward deliverableSpec (no behavior change)"
```

---

## Task 2: Run loop appends child deliverable nodes

**Files:** `src/portal-briefs.jsx`

- [ ] **Step 1: Add two helpers** near `buildInitialRunNodes` (top-level functions):

```js
/* Which group + part (if any) an agent fills in the Delivery Plan, plus the
   single platform we fan out for in Plan 3 (first platform of the group).
   Returns null when there is no plan or the agent isn't in it → the run
   behaves exactly as a legacy single-output run. */
function deliverableSpecForAgent(agentId, plan) {
  for (const g of plan?.deliverableGroups || []) {
    for (const [part, id] of Object.entries(g.crew || {})) {
      if (id === agentId) {
        return { type: g.type, part, count: g.count, platform: g.platforms?.[0] || "generic" };
      }
    }
  }
  return null;
}

/* Build N child nodes branching off a specialist node, one per deliverable.
   Stacked in a column to the right of the parent; edges added by the caller. */
function buildDeliverableChildNodes(specNode, deliverables) {
  const w = 300, h = 150, gap = 18;
  const span = deliverables.length * (h + gap) - gap;
  const top = specNode.y + (specNode.h ? specNode.h : 116) / 2 - span / 2;
  return deliverables.map((d, i) => ({
    id: `${specNode.id}-d${i}`,
    parentId: specNode.id,
    x: specNode.x + specNode.w + 140,
    y: top + i * (h + gap),
    w,
    kind: "deliverable",
    title: d.title || `${specNode.title} · ${i + 1}`,
    body: d.body || "",
    assetUrl: d.assetUrl || null,
    platform: d.platform || "generic",
    status: d.status || (d.qa?.passed === false ? "flagged" : "approved"),
    qa: d.qa || null,
  }));
}
```

- [ ] **Step 2: Pass `deliverableSpec` in `runAssembly`'s `streamSpecialistRun` call.** In `BriefRunCanvas.runAssembly`, where it builds the call, add the lookup and pass it:

```js
      const dspec = deliverableSpecForAgent(agent.id, context.deliveryPlan);
```
(declare it just before the `await streamSpecialistRun({` call) and add to that call's options:
```js
        deliverableSpec: dspec || undefined,
```

- [ ] **Step 3: Append child nodes when a deliverable run completes.** In the same loop, in the `onDone` handler (or immediately after the `setNodes(...)` that marks the spec `done`/`flagged`), add:

```js
        /* Fan-out: a deliverable run returns N items → append a child card
           per item. Legacy runs (no deliverables) skip this entirely. */
        if (data?.output?.kind === "deliverables" && Array.isArray(data.output.deliverables)) {
          setNodes((prev) => {
            const specNode = prev.find((n) => n.id === "spec-" + agent.id);
            if (!specNode) return prev;
            const children = buildDeliverableChildNodes(specNode, data.output.deliverables);
            setEdges((e) => [
              ...e,
              ...children.map((c) => ({ from: specNode.id, to: c.id, fromSide: "right", toSide: "left" })),
            ]);
            return [...prev, ...children];
          });
        }
```
(`data` is the `onDone` payload. If the existing `onDone` already destructures, adapt to read `data.output`.)

- [ ] **Step 4: Live verify.** App up. Run a brief whose plan asks for several captions (e.g. "a week of Instagram captions"). After the copy specialist completes, **N child cards appear** branching off it. The specialist node, Run button, header, pan/zoom all still behave as before. A plain single-specialist brief shows exactly one node (no children) — unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/portal-briefs.jsx
git commit -m "feat(canvas): fan a deliverable run out into child cards (additive)"
```

---

## Task 3: Composite deliverable card (renderNode case)

**Files:** `src/portal-briefs.jsx` (the `renderNode` inside `BriefRunCanvas`)

- [ ] **Step 1: Add a `deliverable` branch at the TOP of `renderNode`**, before the existing specialist logic, so existing kinds are untouched:

```js
    if (node.kind === "deliverable") {
      const flagged = node.status === "flagged";
      const stateColor = flagged ? "var(--pink-500)" : "var(--green-500)";
      return (
        <div className="cv-node" style={{
          background: "var(--c-card)", border: "1px solid var(--c-line)",
          borderLeft: `3px solid ${stateColor}`, borderRadius: 10, overflow: "hidden",
          boxShadow: "var(--shadow-md)", width: "100%",
        }}>
          {node.assetUrl && (
            <div style={{ height: 120, backgroundImage: `url("${node.assetUrl}")`, backgroundSize: "cover", backgroundPosition: "center" }} />
          )}
          <div style={{ padding: "10px 12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <span className="eyebrow" style={{ fontSize: 9, color: stateColor }}>
                {(node.platform || "generic").toUpperCase()} · {flagged ? "FLAGGED" : "READY"}
              </span>
              {node.qa?.voice_match != null && (
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--c-faint)" }}>{node.qa.voice_match}/100</span>
              )}
            </div>
            {node.title && <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 4, color: "var(--c-ink)" }}>{node.title}</div>}
            <div style={{ fontSize: 12, lineHeight: 1.4, color: "var(--c-dim)", maxHeight: 76, overflow: "hidden" }}>{node.body}</div>
          </div>
        </div>
      );
    }
```

- [ ] **Step 2: Live verify.** The N child cards now render as composite cards: image strip on top (when present), caption/title/body, platform + status badge, per-item QA score. Existing specialist cards look identical to before.

- [ ] **Step 3: Commit**

```bash
git add src/portal-briefs.jsx
git commit -m "feat(canvas): composite deliverable card render"
```

---

## Task 4: Pair an image per deliverable (image specialist per slot)

**Files:** `src/portal-briefs.jsx` (`runAssembly`)

> Scope note: Plan 3 fans out a single platform per group (the group's first platform). Multi-platform variants are a later enhancement. The image specialist is fired once per text deliverable, illustrating its caption.

- [ ] **Step 1: After a copy group's child cards exist, run its paired visual specialist per slot.** In `runAssembly`, after the loop has produced the deliverable child cards for a group's copy agent, detect the group's visual part and fire its specialist once per child with the caption as `sourceText`. Add, right after the child-append block in Step 3 of Task 2:

```js
        /* If this deliverable's group pairs a visual specialist, render one
           image per child card, illustrating that card's copy. Cheap-tier
           image model; each lands on its own child. */
        const group = (context.deliveryPlan?.deliverableGroups || [])
          .find((g) => Object.values(g.crew || {}).includes(agent.id));
        const visualAgentId = group && Object.entries(group.crew).find(([part]) => /image|frames|hero/i.test(part))?.[1];
        if (group && visualAgentId && Array.isArray(data.output?.deliverables)) {
          const platform = group.platforms?.[0] || "generic";
          for (let i = 0; i < data.output.deliverables.length; i++) {
            const childId = "spec-" + agent.id + "-d" + i;
            await streamSpecialistRun({
              specialistId: visualAgentId,
              briefText: context.composedBrief || context.rawBrief || "",
              briefId: sharedBriefId,
              deliverableSpec: { type: group.type, part: "image", count: 1, platform, sourceText: data.output.deliverables[i].body },
              onProgress: () => {},
              onDone: (img) => {
                const url = img?.output?.asset_url || null;
                if (url) setNodes((prev) => prev.map((n) => n.id === childId ? { ...n, assetUrl: url } : n));
              },
              onError: () => {},
            });
          }
        }
```
(`sharedBriefId` is the run-scoped brief id already used by the loop. If named differently in the current code, use that.)

- [ ] **Step 2: Live verify.** A "social posts" brief now shows each child card with BOTH a caption and a generated image. Text-only deliverable groups (e.g. email) show text-only cards — no spurious image calls.

- [ ] **Step 3: Commit**

```bash
git add src/portal-briefs.jsx
git commit -m "feat(canvas): pair a per-slot image with each deliverable card"
```

---

## Task 5: Per-card select + Export selected

**Files:** `src/portal-briefs.jsx` (`BriefRunCanvas`)

- [ ] **Step 1: Add selection state** in `BriefRunCanvas`: `const [selected, setSelected] = useBrState({});` (map of childId → true).

- [ ] **Step 2: Add a select toggle to the deliverable card.** In the Task 3 card, add a checkbox in the header that toggles selection. Because `InteractiveCanvas` routes clicks via `onNodeClick`, wire selection through a small button with `onPointerDown={(e) => e.stopPropagation()}` so it doesn't start a drag:

```js
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); onToggleSelect(node.id); }}
              style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 14, color: isSelected ? "var(--green-500)" : "var(--c-faint)" }}
              title={isSelected ? "Selected" : "Select"}
            >{isSelected ? "☑" : "☐"}</button>
```
Thread `onToggleSelect` + `isSelected` into the `renderNode` closure (it already closes over component state).

- [ ] **Step 3: Add an "Export selected" action** to the canvas `toolbarExtra` (next to the existing run-complete actions), visible when `Object.keys(selected).length > 0`. It gathers the selected child nodes' `{title, body, assetUrl, platform}` and downloads a JSON (reuse the existing export-as-blob pattern from `InteractiveCanvas.exportLayout` style).

- [ ] **Step 4: Live verify.** Click ☐ on individual cards → they toggle ☑. "Export selected (n)" appears; clicking downloads only the chosen deliverables. Pan/zoom/drag unaffected.

- [ ] **Step 5: Commit**

```bash
git add src/portal-briefs.jsx
git commit -m "feat(canvas): per-deliverable select + export selected"
```

---

## Task 6: `BriefViewCanvas` hydration (saved briefs)

**Files:** `src/portal-briefs.jsx` (`BriefViewCanvas`)

- [ ] **Step 1: Hydrate child nodes from stored `{deliverables}` bodies.** In `BriefViewCanvas`, after the existing `nodes`/`edges` are built, append deliverable children for any run whose output body is `{ kind: "deliverables" }`:

```js
  /* Hydrate fan-out children for saved deliverable runs. Old {text} outputs
     are unaffected — they render as the single specialist card as before. */
  specs.forEach((s) => {
    const body = s.output?.body;
    if (body?.kind === "deliverables" && Array.isArray(body.deliverables)) {
      const specNode = nodes.find((n) => n.id === "spec-" + (s.agent?.id || s.run.specialist_id));
      if (specNode) {
        const children = buildDeliverableChildNodes(specNode, body.deliverables.map((d) => ({
          title: d.title, body: d.body, assetUrl: d.asset_url || d.assetUrl || null, platform: d.platform, status: d.status, qa: d.qa,
        })));
        nodes.push(...children);
        children.forEach((c) => edges.push({ from: specNode.id, to: c.id, fromSide: "right", toSide: "left" }));
      }
    }
  });
```

- [ ] **Step 2: Add the same `deliverable` case to `BriefViewCanvas`'s `renderNode`** (copy the Task 3 branch verbatim — it's a self-contained read-only card). For DRY, optionally extract the card to a `DeliverableCard({ node })` component used by both renderNodes; if extracting, do it as a pure presentational component with no behavior change.

- [ ] **Step 3: Live verify.** Open a saved brief that was run with deliverables (from Library → click brief). Its child cards render. A saved brief from before this feature (plain `{text}`) opens exactly as it always did.

- [ ] **Step 4: Commit**

```bash
git add src/portal-briefs.jsx
git commit -m "feat(canvas): hydrate saved deliverable runs in BriefViewCanvas"
```

---

## Self-Review

**Additive guarantee:** every task is guarded by `kind === "deliverable"`, `data.output.kind === "deliverables"`, or `deliverableSpecForAgent(...) != null`. No existing branch is modified; legacy runs and saved briefs are untouched. `InteractiveCanvas`, `CanvasHeader`, `buildInitialRunNodes`, the Run button, and `SpecialistNotepad` are not edited.

**Carry-forwards from Plan 2 review honored:** per-item QA badge uses `node.qa.voice_match` (not a batch score); status badge uses server-computed `node.status`; malformed runs still produce one card (graceful). Empty-plan handling: if `deliveryPlan.deliverableGroups` is empty, no `deliverableSpec` is attached and the run is a normal single-output run — surfacing a "couldn't form a plan" message is a Plan 4 UX concern (noted).

**Verification model:** live + visual (app must be up). Each task has an on-screen check; legacy-path checks confirm no regression.

**Scope deferred to Plan 4:** multi-platform variants (Plan 3 fans the group's first platform), the credit estimate/adjust review step, validating model-supplied crew ids against `CI_AGENTS`, and the model-routing re-tune.

---

## Roadmap — Plan 4

Review step shows per-group count + platform chips + credit estimate (`estimateCr` × `CI_AGENTS` cr) with adjust controls; validate crew ids against `CI_AGENTS` before dispatch; multi-platform fan-out loop; then the model-routing re-tune for flagged creative specialists, verified against `brand_specialist_stats`.

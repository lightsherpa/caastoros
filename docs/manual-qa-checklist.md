# Manual QA checklist — CaastorOS

`npm run smoke` covers routes, auth and the credits/members/brands payloads.
Everything below is what only a human eye catches. Run `npm run dev:all`, open
http://localhost:5173, and walk it in this order. Tick as you go.

## Sign in → Create
- [ ] Sign in lands on **Create**, not a blank shell. *Wrong: spinner that never resolves, or a flash of the signed-out screen after you're in.*
- [ ] Credits pill in the sidebar shows a number and the tier. *Wrong: "—", "NaN", or any dollar amount anywhere — users see credits only, never API cost.*

## New brief → run
- [ ] Type a brief, submit. Brandolph proposes a crew including at least one IMAGE specialist on a visual brief. *Wrong: text specialists only — that's the `fluxSchnell`-missing-from-`IMAGE_MODELS` bug.*
- [ ] Motion & Sound is greyed out and reads "coming soon". *Wrong: it's runnable.*
- [ ] Start the run. Text nodes stream token-by-token; image nodes show a queued/working state then a thumbnail. *Wrong: a node that sits blank forever with no error.*

## Canvas — the part arithmetic can't verify
- [ ] **On an IMAGE node** (the one with the 48px thumbnail): the provenance footer at the card bottom is **fully visible, not clipped**. Cards are a fixed 152px and this is the single change made by arithmetic and never seen rendered. *Wrong: the footer's descenders cut off, the dashed rule sitting flush at the card edge, or the line missing entirely.*
- [ ] Footer reads like `🧠 BIO v7 · self-certified · 45s`. Segments with no data are dropped, not faked. *Wrong: "BIO v" with no number, "· null", or "0s".*
- [ ] **No card anywhere reads "certified by <a human name>"** unless a real Steward signed that exact BIO version. Self-certified BIOs must say `self-certified`. *Wrong: a name borrowed from a different BIO version, or any name on a Discovery self-compile.*
- [ ] Text and image nodes are the same height and sit on a clean grid. *Wrong: ragged rows, overlapping cards, one node taller than its neighbours.*
- [ ] Drag the canvas — it pans smoothly and keeps panning if the cursor leaves the window. Scroll/pinch zooms around the pointer. *Wrong: the drag drops when you cross a node, or zoom jumps to a corner.*
- [ ] Click a node — it expands to the full output. Click the background — it collapses. *Wrong: clicks land but nothing opens (a node wired with a raw `onClick` instead of `onNodeClick`).*
- [ ] The **CanvasHeader** is present ABOVE the canvas: overview, tension line, department chips, expandable brief/refusals. *Wrong: missing. It has been deleted twice by refactors and the user notices immediately.*
- [ ] Zoom out to fit — the whole graph fits without content spilling past the viewport. *Wrong: nodes clipped at the edges at min zoom.*

## Library
- [ ] Outputs from the run you just did are listed, newest first, with the same cert wording as the canvas. *Wrong: cert label disagrees between Library and canvas for the same output.*

## Account → Settings
- [ ] **Workspace** tab shows the real workspace name (and its initial in the avatar). *Wrong: "—", "?", "Loading…" that never resolves, or a placeholder name.*
- [ ] **Members** tab lists real email addresses with a role pill each, count matching the header. *Wrong: empty list, `undefined`, or only your own row when the workspace has more.*
- [ ] **Tier & billing** shows tier and credits. *Wrong: any raw model cost or provider name.*

## Team (only if this account is a team member)
- [ ] Job queue, Capacity and Clients load with real brand names. *Wrong: 403 for an active team member, or a client from another workspace appearing on a non-team account.*
- [ ] Sign in as a plain client — the Team section is absent from the sidebar entirely. *Wrong: visible but erroring on click.*

## Theme
- [ ] Toggle light/dark and switch palette. Canvas cards, footers and chips stay legible in both. *Wrong: faint grey provenance text vanishing on the dark background.*



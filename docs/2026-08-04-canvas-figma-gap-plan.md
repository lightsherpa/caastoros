# Canvas · Figma gap plan

Figma: `Caastor AI Optimize` → node `180:1278` (`workspace-right`).
Reads against: `docs/2026-08-04-replit-ux-adoption-caastoros.md` (Phase 3) and the shipped
`InteractiveCanvas` / `BriefRunCanvas` / `BriefViewCanvas` in `src/portal-briefs.jsx`.

Context: two weeks to design-partner testing. This document separates what the Figma
**confirms**, what it **adds**, and what it **contradicts** — then sequences only what
survives the deadline.

---

## Part 1 — What the Figma actually specifies

The frame decomposes cleanly. Component contract from the Figma tree:

```
workspace-right
├── canvas-header (44px)
│   ├── header-left   → chevron · BRIEFS / {brief title}
│   └── header-right  → tension-badge · dept-dots · "8 specialists · 5 done"
│                       · credits · "Review with Brandolph" · 84% · maximize
└── canvas-desk
    ├── spatial-flow-container → dot-mesh + artifact-card ×8 + edges
    ├── brandolph-progress-card (bottom-left, 280×131)
    ├── canvas-toolbar (bottom-center, 476×44)
    └── zoom-pill (bottom-right, 123×32)
```

And every node is one repeated component:

```
artifact-card
├── node-header → tag-dept (dot + label)  ·  tag-status (chip, right-aligned)
├── node-body   → title  +  node-content (typed preview)
└── node-footer → avatar-pair (glyph + "BIO · 12 min")
```

Five status values appear: `APPROVED`, `RUNNING`, `QUEUED`, `DONE`, `FLAGGED`.

---

## Part 2 — Confirms (Phase 3 as written is right)

These need no re-spec; the Figma just proves the doc's instinct.

- **Dark desk, light frames.** The dot-mesh desk reads as "behind"; every artifact card is a
  light surface. Exactly `--bg-desk` + artifact surface from Phase 1's token work.
- **Bottom-center toolbar, six tools.** `Select · Pan · Chat · Annotate · Edit · Generate` —
  identical to the Phase 3 list, in the same order.
- **Zoom pill bottom-right**, separate from the toolbar. As specified.
- **Docked Brandolph card bottom-left** with live narration and "Expand chat →". Phase 4 item,
  already correctly scoped.
- **Persistent header that never scrolls away.** Confirms the standing rule not to remove
  `CanvasHeader`.

**Action: none. Build Phase 3 as written for all of the above.**

---

## Part 3 — Adds (in the Figma, missing from Phase 3)

### 3.1 Provenance footer on every node — *the highest-value item here*

Every card ends with `🧠 BIO · 12 min`. Two facts on every single artifact: **which BIO
produced it** and **how long it took**. Phase 3 never mentions this.

This is the moat rendered as a UI primitive. Right now BIO attribution appears once, in the
header; the Figma puts it on all eight nodes. That is the difference between "an AI made this"
and "your certified brand intelligence made this, and here's the receipt."

Cheap, because the data already exists:

- `runs.bio_version` — already selected in `BriefViewCanvas`.
- `runs.latency_ms` / `started_at` / `ended_at` — in the table, **not** currently selected.
  One-field change to the query at `portal-briefs.jsx:2757`.
- Cert attribution already resolves in `BriefViewCanvas` (`cert.byName`).

With two-tier cert now live, the footer should distinguish the tiers — `BIO v2 · self` vs
`BIO v2 · certified by Marina`. Self-certified work must never borrow the senior signature.

### 3.2 Typed content previews per department

The Figma renders node content by kind, not as generic text:

| Dept | Preview |
|---|---|
| Strategy | Bulleted findings (`· Demographic shifts favor minimalism`) |
| Copy | Numbered lines (`1. Simplified pricing is here.`) |
| Visual | Four color swatches |
| Web | Grey wireframe skeleton |

**This contradicts Phase 3**, which says "do not restructure node content markup beyond
wrapping it under the title bar." The Figma wants exactly that restructure. See Part 5.

### 3.3 Queued nodes explain what they're blocked on

> Email Sequence — QUEUED — *"Waiting for headline decisions from primary hero node."*

Not "queued", but *queued on what*. This is the single biggest comprehension upgrade in the
frame and the most expensive to build honestly: it needs a real dependency edge between
specialists, and today `handleRun` fires them in a flat sequential loop
(`portal-brandolph.jsx`, `for (const agent of realAssembly.agents)`).

The Sharpener already returns a `deliveryPlan` — that is where dependencies would come from.
Whether it carries ordering today needs checking before this is scoped.

### 3.4 Inline QA warning on flagged nodes

Flagged cards get a red border **and** an in-card line: `● High contrast warning from QA team`.
Current code has a flagged state but surfaces the reason only in the drawer. The QA verdict is
already on `qa_results` — surface one line of it on the card.

### 3.5 Header details

- **`3 tensions` as a count badge.** Tension exists in `CanvasHeader` as prose; the Figma makes
  it a countable, clickable chip.
- **`dept-dots`** — four dots showing department mix at a glance, left of the counter.
- **`8 specialists · 5 done`** — a run-progress counter in the header itself.
- **44px single row.** Tighter than the doc's "pinned translucent bar". The Figma header is
  chrome; the current `CanvasHeader` is a panel with an expandable brief inside it.

### 3.6 `DONE` and `APPROVED` are different states

The Figma treats them as distinct chips, and that matches the database exactly:
`outputs.status` is `pending | approved | flagged | rejected`, and `runs.status` is
`queued | running | completed | failed`. So:

- `RUNNING` / `QUEUED` ← `runs.status`
- `DONE` ← run completed, output still `pending` (produced, awaiting you)
- `APPROVED` ← `outputs.status = 'approved'`
- `FLAGGED` ← `outputs.status = 'flagged'`

This is the same distinction already encoded in `src/lib/home-stats.js` (`briefProgress`).
The vocabularies now agree — worth keeping them that way.

---

## Part 4 — Contradiction to resolve

**Phase 3 item 2 vs Figma §3.2.** Phase 3 explicitly forbids restructuring node content, for a
good reason: that markup is where canvas regressions hide, and the pointer-capture wrapper
makes every change riskier than it looks.

The Figma requires typed previews to land its effect. A card showing four swatches communicates
in a glance what a paragraph of alt-text cannot.

**Recommendation: honour Phase 3's restriction for the first pass, then add previews as a
separate, isolated change.** Typed previews are additive — a `renderPreview(kind, body)` switch
that returns the existing text node as its default case. It can ship a day after the restyle
without entangling the two diffs. If the restyle regresses, you bisect one change, not two.

---

## Part 5 — Sequencing against the two-week deadline

The blunt read: Phases 2, 3, and 4 plus the data gaps is not two weeks of work. Something gets
cut. My argument for what:

**A tester who cannot get past an empty home never reaches the canvas.** The moat only defends
territory the user actually walks onto.

Current known blockers, in the order a new tester hits them:

1. **Empty first-run.** Home now renders honest zeros. Every fresh signup lands there.
2. **Settings shows another company's staff** — `portal-craft.jsx` still lists "Vinilo Coffee"
   and three `@vinilo.coffee` members. This is customer-facing and reads as a data leak.
3. **Negative credit balance** on brands with no grant row.
4. Then, and only then, the canvas.

### Proposed order

| # | Work | Size | Why here |
|---|---|---|---|
| 1 | Settings surface off mock data | S | Customer-facing, reads as a leak, embarrassing in a demo |
| 2 | Signup credit grant + first-run empty states | S | Otherwise every tester starts at "broken" |
| 3 | **Figma §3.1 — provenance footer** | S | Highest moat-per-line in the whole document |
| 4 | Phase 3 restyle: desk, frames, status chips, toolbar, header | L | The canvas, as already specced |
| 5 | **Figma §3.4 + §3.5** — QA line, tension badge, dept dots, counter | M | Rides along with 4 |
| 6 | **Figma §3.2 — typed previews** | M | Isolated follow-on, per Part 4 |
| 7 | Phase 4: docked Brandolph, settings overlay | M | Real value, first safe cut |
| 8 | **Figma §3.3 — dependency-aware queueing** | L | Needs a dependency model; do not rush this |

**Cut lines.** If the fortnight tightens, drop 7 and 8 first — the docked Brandolph is a nicer
version of a floater that already works, and fake dependency copy is worse than none. Item 3
should not be cut at any point; it is four lines of query and a footer, and it is the single
clearest expression of what CaastorOS is.

### Phase 2 (prompt-first home)

Not in this Figma, and partially overtaken: `HomeCreate` was wired to live data today and the
scope pills removed. What remains of Phase 2 is consolidating `HomeConsole` / `HomeCards` /
`HomeDesk` — all three still render Vinilo mock data and are reachable through Tweaks →
Brandolph → "Home layout". **Deleting those three variants plus the selector is ~15 minutes and
removes the last user-reachable Vinilo surface outside Settings and Team.** It is the cheapest
item on this page. It needs your say-so because it removes layouts you may still be using to
think with.

---

## Part 6 — Open questions

1. **Does `deliveryPlan` carry ordering?** Determines whether §3.3 is a rendering change or a
   scheduler change. Worth answering before committing to item 8.
2. **Dark as default?** The doc closes by suggesting the flip once stable. The Figma is dark-only
   — no light variant of this frame exists. If dark ships as default, the light theme needs its
   own pass on the canvas or it becomes the untested path.
3. **Is `180:1278` the whole redesign?** It is one frame on one page (`High Fidility`), named
   `workspace-right` — implying a `workspace-left` sibling that isn't in this node. If sidebar
   or home frames exist, they should be read before item 4 starts.

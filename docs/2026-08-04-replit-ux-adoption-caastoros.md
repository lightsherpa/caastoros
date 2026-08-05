# CaastorOS × Replit-grade UX

**Date:** 2026-08-04
**Purpose:** Decode what makes the Replit workspace UX work, map it surface-by-surface onto CaastorOS, and produce a single Claude Code prompt to implement it.
**Decisions locked with Oscar:** prompt-first home (yes), theme user-switchable via `ds.theme` (light + dark), one single implementation prompt.

---

## Part 1 — What Replit is actually doing (and why it works)

Five screenshots, one system. Here is the anatomy.

### 1.1 The shell: quiet chrome, loud work

The entire frame is near-black charcoal (~`#0E0E0E` to `#1A1A1A`) with hairline separators and low-contrast gray labels. Nothing in the chrome competes for attention. The only saturated elements are: the primary CTA (blue `Upgrade`), an occasional orange accent, and the work itself. The result: your content is always the brightest thing on screen. This is the single most important trick in the whole system.

The left sidebar is narrow, flat, and permanent: workspace switcher at top, two primary actions (`+ Create something new`, `Import code or design`), then a plain nav list (Home, Projects, Published Projects, Integrations, Security, Promotions, Settings). At the bottom: plan status with two usage meters (Agent credits, Cloud credits) and the Upgrade button. No icons-only collapse, no nesting. Boring on purpose.

### 1.2 Prompt-first home

The home screen is one question: "Hi Oscar, what do you want to make?" Below it, a single large input with placeholder ("Make a landing page for..."), an attach button, a `Use a design system` chip, a model/economy selector, a `Plan` toggle, mic, and send. Under the input: a horizontal row of mode chips (Website, Mobile, Design, Data Visualization, Animation) with paddle arrows, then three example prompts, then `Your recent Projects` as a card grid with `View All`.

The hierarchy is exact: intent first, mode second, inspiration third, history last. There is no dashboard, no stats, no feed. The empty space is the design.

### 1.3 The canvas: an infinite dark desk with light frames

The project workspace is an infinite pannable/zoomable canvas on a dark dot-grid background. Every screen of the app being designed lives as a **frame**: a light card floating on the dark desk. Each frame has its own mini title bar: `Design | Kid Home — Wallet & Jars` with an expand icon. The title bar carries two pieces of metadata: the mode (Design/Build) and the human name of the screen.

Because the desk is dark and the frames are light, ten frames at once read as a gallery, not as clutter. You get spatial memory (the Earn flow lives left, the Parent flow lives bottom) plus glanceable comparison. This is exactly the mental model of a creative director's wall of printouts.

### 1.4 The floating toolbar

Bottom-center, a pill-shaped dark toolbar: **Select, Pan (hand), Chat, Draw, Edit, Generate**. Icon + label, active state highlighted. It floats above everything, never scrolls away, and holds the six verbs of the whole product. Two are navigation verbs (select, pan), four are creation verbs (chat, draw, edit, generate). That's the entire interaction vocabulary in one place.

### 1.5 The agent presence: a docked progress bubble

While the agent works, a small card docks bottom-left: the user's last instruction as a chip ("you didn't use the design system I added"), a status line ("34 actions · Worked for 5 minutes"), and the agent's current narration in plain text, with `Expand chat` on hover. The chat does not own the screen; the canvas does. The agent reports from the corner like a good producer.

### 1.6 The right rail: reference, not chrome

Templates / Inspiration / Library tabs in a collapsible right panel, with searchable real-world patterns (Mobbin). Reference material sits at the same visual layer as the work but on the opposite edge. Optional, dismissible.

### 1.7 The workspace menu and settings overlay

Clicking the workspace name opens a compact dropdown: Home, Recent items, Settings, Notifications, CLUI, Theme (System/Light/Dark), Help, Log out. Settings itself opens as a **full-screen overlay modal** on top of the workspace (dimmed canvas behind), with its own grouped left nav (Workspace / Account / User). You never "leave" your work to configure things.

### 1.8 Frame content quality

Inside frames: warm neutral backgrounds (`#FAF7F2`-ish), one hue family per functional area (green wallet, purple invest, pink share, orange spend), oversized numerals for key values, chip-shaped metadata (streak, level), soft 16–20px radii, generous padding. State variety is designed in (pending approval, locked, unfinished with stake returned). This is a real design system, not decorated wireframes.

---

## Part 2 — Mapping it to CaastorOS, surface by surface

The good news: CaastorOS already has the bones. `InteractiveCanvas` (pan/zoom/drag, pointer-captured), `CanvasHeader`, shell modes (`default` vs `workspace` via `WORKSPACE_ROUTES`), a design-settings system (`ds.theme/palette/font/density` → `data-*` attributes on `<html>`), the Brandolph floater, and a hash router. This is a reskin plus three structural upgrades, not a rebuild.

### 2.1 Theme architecture (the foundation)

Two themes, user-switchable through the existing `useDesignSettings` hook. No new mechanism.

- **`data-theme="light"`** — current CaastorOS feel, refined: warm paper background, ink text, yellow mascot accent.
- **`data-theme="dark"`** — the Replit model: charcoal shell (`#111214` chrome, `#0C0D0E` canvas desk), hairline borders at ~8% white, gray-500 labels, and **light artifacts on top**. Deliverable cards, brief cards, and canvas nodes stay light (`#FCFAF6`) in both themes. The work is always the brightest thing.

All of it lives in the token files (`ds-tokens.css`, `caastor-tokens.css`, `portal.css`) keyed off `[data-theme]`. Zero inline hex in components; the reskin is also the cleanup that removes the inline styles currently scattered in `TopBar` and friends.

Caastor accent logic: yellow `#F8C036` stays the identity accent (Brandolph, active states, primary glow), ink `#1A1F36` stays the text ink in light. In dark, yellow reads even better against charcoal. One accent, not five. The old palette-tint experiments stay dead.

### 2.2 Sidebar (the menu)

Restyle `Sidebar`/`AppDock` in `portal-shell.jsx` to the Replit grammar:

- Top: workspace switcher (brand selector for clients) as a compact row with avatar tile + name + chevron. Clicking opens the workspace dropdown (see 2.7).
- Under it: one primary button, **`+ New brief`** (the analog of "Create something new"). This replaces the topbar's "Start a brief" pill as the canonical entry point.
- Nav: flat list, icon + label, current `CLIENT_ROUTES` unchanged (Create, Briefs, BIO, Library, Specialists, Humans, Credits, Account). Section eyebrows become subtle spacers, not loud headers. Team and admin routes keep their sections.
- Bottom: plan block, Replit-style: tier name, **one credits meter** (used vs available, credits only, never API cost), and the `Upgrade` button. This reuses `useLiveCredits` and `useWorkspaceTier`.
- In `workspace` shell mode (brief-detail / canvas / board) the sidebar collapses to an icon rail, hover-reveals labels. The mechanism already exists (`data-shell-mode`); this pass makes the collapsed rail actually beautiful.

### 2.3 Home: prompt-first, Brandolph behind the glass

`BrandolphHome` / `HomeCreate` in `portal-brandolph.jsx` becomes the Replit home:

- Centered greeting: **"Hola Oscar. What are we making?"** (time-aware, brand-aware: "for Vinilo" when a brand workspace is active). One line, large type.
- One large composer (the existing `Composer`, promoted): placeholder rotates through real brief patterns ("A launch campaign for...", "Landing page copy for..."). Inside the input row: attach, a `BIO` chip (the existing `BioChip`, showing BIO score — this is the "Use a design system" analog and it's a better story than Replit's), the economy/premium selector Brandolph already respects, and send.
- Below: **department chips** in a paddled row: Strategy, Concept, Copy, Visual, Web & UX, Research & Ops, and Motion & Sound grayed with "coming soon". Clicking a chip pre-frames the brief ("I want visual work: ...").
- Below that: three example briefs (rotating, from `QuickPrompts`), then **Recent briefs** as a card grid (from `useLiveBriefs`) with status chip, dept color strip, and `View all → Briefs`.
- When the user sends, the screen does not become a chat page. It transitions to the brief workspace (canvas), and Brandolph's diagnosis/assembly happens in the docked bubble (2.6). Chat is a companion, never the destination. The existing HomeConsole/HomeCards/HomeDesk variants collapse into this single home.

### 2.4 The canvas (the MOAT, treated like it)

`InteractiveCanvas` keeps its logic (pointer capture, `onNodeClick` contract, drag-merge, wheel zoom). The upgrade is presentational plus one structural change:

- **Dark desk in dark theme**: dot-grid background (subtle 1px dots at ~7% white, spacing ~24px), light nodes floating on it. In light theme: warm paper desk, slightly deeper dot grid.
- **Frames, not cards**: every canvas node gets a mini title bar in the Replit grammar: `{Dept} | {Specialist} — {Deliverable}` plus an expand icon that opens the existing `DeliverableDrawer`/`SpecialistNotepad`. Wired through `onNodeClick` and a new `onNodeExpand` prop. Never a raw `onClick` on the node div (the wrapper hijacks it; this is a known landmine).
- **Status is chrome**: running = animated accent border on the frame title bar; flagged = red chip; certified = green chip. State lives in the frame chrome so the artifact inside stays clean.
- **`CanvasHeader` stays**, restyled as a pinned translucent bar above the desk (overview, tension, dept chips, expandable brief, refusals, credit total). It does not scroll away and it does not get removed. Ever.
- Zoom controls + fit-to-view bottom-right, matching the floating toolbar's visual language.

### 2.5 The floating toolbar

New shared component, `CanvasToolbar`, bottom-center on `brief-detail`, `canvas`, and `board` routes. Pill, dark in both themes (charcoal pill works on paper too), icon + label:

- **Select** — default pointer, node selection.
- **Pan** — hand tool (spacebar-drag as shortcut, like every canvas tool on earth).
- **Chat** — docks/undocks the Brandolph panel (2.6).
- **Annotate** — Replit's "Draw": drop pin-comments on frames. These write to the existing feedback signals (`brand_signals`: flag/edit events), so annotation feeds Brandolph memory. V1 is pins + text, not freehand ink.
- **Edit** — opens the selected frame in `SpecialistNotepad` (existing edit flow).
- **Generate** — the money verb: opens a mini-composer to add a specialist run to this brief ("Give me two more headline routes"), routed through the existing run flow.

Six verbs, same as Replit, each mapped to a flow CaastorOS already has. No new features hiding in the toolbar, just new access.

### 2.6 The docked Brandolph bubble (results, live)

The floater (`portal-floater.jsx`) evolves from mascot-button-with-chat-panel into the Replit progress bubble on run surfaces:

- While a brief runs: docked card bottom-left showing the user's instruction as a chip, a status line (**"7 specialists · 4 done · 210 credits"** — credits, never cost), and Brandolph's streamed narration. `Expand chat` reveals the full panel.
- Idle: it collapses back to the mascot button, keeping the memory-derived contextual greetings (`deriveContextFromMemory`) which are already better than anything Replit's bubble says.
- Hidden on home (chat is primary there) and team portal, as today.

Results themselves stay on the canvas: as each specialist completes, its frame populates in place. The "result page" is the canvas with `CanvasHeader` totals updating — you watch the wall fill up. `BriefDelivery` remains as the formal delivery/export view.

### 2.7 Workspace menu + settings overlay

- Workspace dropdown (from the sidebar switcher): Home, Recent briefs (last 3), Settings, Notifications, Theme (System/Light/Dark → writes `ds.theme`), Help, Log out. Compact, dark-friendly, replaces scattered entry points.
- **Settings as overlay modal**: Account/Credits/Admin surfaces open as a full-screen overlay above the current screen (dimmed behind, X to close), with grouped left nav — Workspace (brand, collaborators, integrations, design settings), Account (usage, billing, plan), User (profile, notifications). Route-addressable (`#/settings/...`) so deep links still work. You never lose your canvas to check billing.

### 2.8 How everything looks (the system in one paragraph)

Chrome whispers, work shines. Charcoal shell at three elevations (desk, panel, pill) with hairline borders; warm paper artifacts floating on top; one yellow accent doing all the accent work; IBM Plex family as-is (Sans Condensed display, Mono for eyebrows/metadata — the mono eyebrow habit is already very Replit); 8px radius on chrome, 16px on artifacts; motion limited to 150–200ms ease-out on dock/undock, frame-populate, and toolbar state. Density and font stay user-tunable through the existing `ds` settings.

### 2.9 What we deliberately do NOT copy

- No CLUI, no Deployments/Integrations nav items — not our product.
- No right-rail Mobbin clone in v1. The hook exists later ("Inspiration" fed by BIO references + Library assets) but it's out of scope now.
- No freehand Draw. Annotate-pins only, wired to signals.
- No flow changes beyond the three sanctioned ones: prompt-first home, floating toolbar, settings overlay. Everything else is skin.

---

## Part 3 — The Claude Code prompt

Copy-paste everything in the block below into Claude Code at the repo root. It is written to be run in one session; internal checkpoints tell it where to stop and let you verify.

```text
# CaastorOS — Replit-grade UX/UI adoption (single pass, checkpointed)

Read CLAUDE.md first and obey every standing rule in it. In particular:
- Do not change flows or features beyond what this prompt explicitly specifies.
- Never show internal API costs anywhere; credits only.
- Never remove or degrade CanvasHeader.
- Wire all canvas node interactions through props (onNodeClick / new onNodeExpand), never direct onClick on node divs — the canvas wrapper uses setPointerCapture and hijacks inner clicks.
- Do not touch TEXT_MODELS / IMAGE_MODELS / RUNNABLE sets in portal-brandolph.jsx.
- Do not reintroduce palette tint experiments. Theming goes exclusively through the existing ds.theme mechanism.
- Keep the hash router; no router library.
- The project is called CaastorOS.

## Goal

Adopt the Replit workspace UX model: quiet dark chrome with light work floating on an infinite canvas, a prompt-first home, a bottom-center floating toolbar, a docked agent-progress bubble, and settings as an overlay. Two user-switchable themes via the existing design-settings system. This is primarily a presentational system upgrade plus three sanctioned structural changes: (1) prompt-first home, (2) floating canvas toolbar, (3) settings overlay.

## Design language (both themes)

Define everything as CSS custom properties in public/caastor/ds-tokens.css and public/caastor/caastor-tokens.css, keyed off html[data-theme]. Consume them in portal.css and components. Remove inline hex colors from portal-shell.jsx (TopBar, Sidebar, UpgradeView etc.) as you restyle those components — inline styles migrate to classes using tokens.

Shared constants:
- Accent: --accent: #F8C036 (Caastor yellow). One accent. Accent-ink for text on accent: #1A1F36.
- Artifact surface (canvas nodes, deliverable cards, brief cards): warm paper #FCFAF6 with ink #1A1F36 text, radius 16px, subtle shadow. Artifacts are LIGHT IN BOTH THEMES — the work must always be the brightest thing on screen.
- Chrome radius 8px; artifact radius 16px; pill radius 999px.
- Type: keep IBM Plex family exactly as configured (Sans Condensed display, Sans body, Mono for eyebrows/uppercase metadata). Do not change fonts.
- Motion: 150–200ms ease-out only, for toolbar state, panel dock/undock, and frame populate. No large animations.

data-theme="dark" (new, Replit model):
- --bg-desk: #0C0D0E (canvas/desk background)
- --bg-chrome: #141517 (sidebar, topbar, panels)
- --bg-raised: #1C1D20 (dropdowns, pills, toolbar)
- --line: rgba(255,255,255,0.08) hairlines
- --text-1: #ECECEC, --text-2: #9BA0A6, --text-3: #6B7076
- Dot grid on canvas desk: 1px dots rgba(255,255,255,0.07), 24px spacing.

data-theme="light" (refine current):
- --bg-desk: warm paper tint (#F4F1EA), --bg-chrome: #FBFAF7, hairlines rgba(26,31,54,0.10), ink text scale. Dot grid rgba(26,31,54,0.10). Keep current overall lightness; this theme should feel like today's CaastorOS, tightened.

Theme switching: reuse useDesignSettings in src/portal-shell.jsx (ds.theme -> html[data-theme]). Add a "system" option that resolves via prefers-color-scheme to light or dark at runtime (store "system", resolve to an effective attribute). Default stays "light".

## Phase 1 — Tokens + shell (STOP after this phase)

1. Implement the token architecture above in the two token files; update portal.css to consume tokens everywhere chrome colors are currently hardcoded.
2. Restyle Sidebar/AppDock (src/portal-shell.jsx):
   - Top: workspace/brand switcher row (avatar tile, name, chevron) that opens a workspace dropdown menu: Home, up to 3 recent briefs, Settings, Notifications, Theme submenu (System / Light / Dark writing ds.theme), Help placeholder, Log out. Reuse existing nav/go and logout handlers; Notifications reuses the existing NotificationBell surface.
   - Below switcher: one primary button "+ New brief" -> go("home") focusing the composer. Remove the "Start a brief" pill from TopBar (its function moves here).
   - Nav: flat icon+label list from the existing CLIENT_ROUTES / TEAM_ROUTES / ADMIN_ROUTES arrays unchanged. Section labels become subtle spacing + tiny mono eyebrows.
   - Bottom plan block: tier name (useWorkspaceTier), ONE credits meter (useLiveCredits) as a thin progress bar with label "Credits", and the Upgrade button. Credits only. Never any currency or API cost.
   - Workspace shell mode: when data-shell-mode="workspace" (existing mechanism), sidebar collapses to a 56px icon rail with hover-reveal labels via CSS. Polish this state.
3. Restyle TopBar: hairline-bordered, transparent over chrome background, breadcrumb (workspace · section / title) in mono eyebrow style, NotificationBell, "Brandolph is reading" indicator, avatar. Height 48px. No inline hex.
4. Verify both themes render on: home, briefs, library, specialists, credits, team portal, admin. Nothing functional may change in this phase.

CHECKPOINT 1: stop, summarize what changed, list files touched, and wait for me to verify both themes before continuing.

## Phase 2 — Prompt-first home (STOP after this phase)

Rework the home route in src/portal-brandolph.jsx (BrandolphHome / HomeCreate and its variants) into a single prompt-first home:

1. Centered greeting, large display type: time-aware and brand-aware ("Good evening, Oscar." / "What are we making for {brand}?"). One line + one subline max.
2. One large composer (promote the existing Composer): rotating placeholder with real brief patterns; inside the input row: attach affordance (non-functional placeholder is fine if uploads aren't wired), the existing BioChip showing BIO score, the existing economy/premium selector if present, send button. Enter sends.
3. Below the composer: department chips row with paddle arrows: Strategy, Concept, Copy, Visual, Web & UX, Research & Ops, and "Motion & Sound" grayed out with a "coming soon" tag (it must NOT be clickable into a run). Clicking a live chip prefixes the composer with a department framing, it does not auto-run.
4. Below chips: three rotating example briefs (reuse QuickPrompts content) as quiet text buttons.
5. Bottom: "Recent briefs" card grid from useLiveBriefs: title, status chip, department color strip, relative date; plus "View all" -> briefs route. Cards use the artifact surface (light in both themes).
6. Sending a brief keeps the EXACT existing submission flow and backend calls — diagnosis, assembly, run. Do not change what happens on submit, only where it is displayed: the user lands in the existing brief workspace surface as today. Consolidate the old HomeConsole / HomeCards / HomeDesk variants into this single home; delete dead variant code only if nothing else imports it.

CHECKPOINT 2: stop, summarize, wait for verification.

## Phase 3 — Canvas as desk + frames + floating toolbar (STOP after this phase)

All in src/portal-briefs.jsx unless noted. InteractiveCanvas keeps ALL current logic (pointer capture, drag-merge on nodeData change, wheel zoom, onNodeClick contract, export).

1. Desk: canvas background uses --bg-desk with the dot grid, both themes. The desk must clearly read as "behind" the frames.
2. Frames: restyle canvas nodes so every node renders with a mini title bar: "{Dept} | {Specialist} — {Deliverable title}", 11px mono, plus an expand icon button. Expand goes through a NEW onNodeExpand prop threaded from BriefRunCanvas / BriefViewCanvas into the existing drawer/notepad open handlers (same functions onNodeClick uses today). No direct onClick on node internals. Node body below the title bar is the artifact surface (light).
3. Frame states in the title bar chrome only: running = animated accent underline; flagged = red chip; certified = green chip; queued = gray chip. Do not restructure node content markup beyond wrapping it under the title bar.
4. CanvasHeader: keep every element it has (overview, tension, dept chips, expandable sharpened brief, refusals, credit totals, progress). Restyle as a pinned translucent bar (backdrop-blur) above the desk in both BriefRunCanvas and BriefViewCanvas. It must remain always visible.
5. New shared component CanvasToolbar (put it in src/portal-shared.jsx), rendered bottom-center on brief-detail, canvas, and board surfaces. Dark pill in both themes. Items: Select, Pan, Chat, Annotate, Edit, Generate — icon + label, active state:
   - Select: default pointer mode (current behavior).
   - Pan: hand mode — dragging empty desk pans (this already works; the tool just makes it explicit and shows the grab cursor). Holding spacebar temporarily activates Pan.
   - Chat: toggles the docked Brandolph panel (Phase 4 wires the full behavior; for now toggle the existing floater open/closed).
   - Annotate: pin-comment mode — click a frame to drop a numbered pin with a small text popover; save writes an "edit"-kind feedback signal through the existing brand_signals path used by node feedback (find the existing signal-write call and reuse it; if only flag/approve exist, use the closest existing kind — do NOT invent a new backend endpoint or migration).
   - Edit: opens the currently selected frame in the existing SpecialistNotepad flow (disabled state when nothing selected).
   - Generate: opens a mini-composer popover that submits an additional specialist run to the CURRENT brief through the exact existing re-run/add-run flow. No new backend behavior.
6. Zoom controls (+ / − / fit) bottom-right in the same pill language.

CHECKPOINT 3: stop, summarize, wait for verification. I will specifically check: CanvasHeader intact, node clicks still work through props, drag/zoom unchanged, both themes.

## Phase 4 — Docked Brandolph bubble + settings overlay + polish

1. Floater (src/portal-floater.jsx): on brief run surfaces, while a run is active, render as a docked bottom-left progress card instead of the mascot bubble: the user's instruction as a truncated chip, a status line "N specialists · M done · X credits" (credits only), and Brandolph's streamed narration line. "Expand chat" opens the full existing chat panel. When idle, collapse back to the mascot button with the existing memory-derived contextual greeting behavior. Keep it hidden on home and team portal as today.
2. Settings overlay: render the Account/Credits (and admin) screens as a full-screen overlay modal above the current route — dimmed backdrop, X to close returning to the previous route, grouped left nav (Workspace / Account / User) mapping to the EXISTING screens and routes (#/settings deep links still work). Screens themselves keep their current functionality; this is a presentational re-housing in portal-shell.jsx's ScreenRouter.
3. Polish pass: consistent focus rings (accent), consistent empty states on the desk ("Nothing on the desk yet — brief Brandolph to fill it"), 150–200ms transitions, reduced-motion media query respected.
4. Run npm run dev:all and verify: both themes across home -> new brief -> run canvas -> deliverable expand -> library -> settings overlay -> team portal. Fix regressions.

FINAL: summarize every file touched, every class/token added, and anything you intentionally did not do. Do not commit; I review first.
```

---

## Part 4 — Sequencing and risk notes

Run the prompt in one Claude Code session but respect the checkpoints; each one exists because of a past incident (CanvasHeader removal, silent canvas click breakage, palette experiments). The verification order is deliberate: tokens/shell first because everything downstream inherits them; canvas last-but-one because it carries the most risk and the most value.

Two things to watch when you verify Phase 3: drag a node, zoom, and click-to-expand in both themes (the pointer-capture wrapper is where regressions hide), and confirm the credits math in `CanvasHeader` still totals correctly after the restyle. And after Phase 4, check the floater on a live run against `#/briefs` — the docked card should never cover the toolbar.

One opinion to close: the dark theme should become the default once it's stable. Replit's trick only fully lands when the desk is dark and the work glows. But that's a flip we make after living with it, not in this pass.

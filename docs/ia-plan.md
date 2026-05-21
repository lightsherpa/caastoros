# Caastor Intelligence — Information Architecture & Navigation Plan

_Author: IA strategy pass · For: lead engineer to implement_
_Scope: client portal nav reorg (priority) + team portal note. Analysis only — no code changes made._

---

## 1. The focus

**The portal's primary job is to turn a request into shipped creative — repeatedly, on a subscription.** Everything else is in service of that loop, or is proof that the loop is trustworthy.

The USP is "creative on demand, as a subscription," and the product bet is **"shape, not produce."** That means the nav must make _one motion_ effortless above all others: **brief Brandolph → watch it assemble → get the work back.** The home (`home` / Brandolph) is not a dashboard among nine peers — it is the product. The sidebar's current flat 9-item list treats the launchpad as item 1 of 9, which flattens the very thing that should dominate.

Reframed by job-to-be-done, the nav has three tiers:

- **PRIMARY — the loop (do the work).** Brandolph home + the briefs/outputs it produces. This is where a subscriber lives day to day. It must be the top, visually distinct, and never more than one click from anything.
- **SECONDARY — the brand canon (what the work is judged against).** The BIO and its Discovery intake. You touch this at onboarding and occasionally to correct it; it is the _source of truth_ Brandolph reads, not a daily destination.
- **TERTIARY / PROOF — how it works + what it costs (trust & account).** Specialists directory, Canvas, Human craft, Credits, Settings. These reassure ("33 real senior agents," "here's how work connects," "here's where credits went") but are not the daily loop. Today they sit as equal-weight nav items, which dilutes the loop and makes the product read like a "tool gallery" rather than a senior operator.

> **One-line focus statement for the team:** _The nav exists to keep the subscriber inside the brief → ship loop, with the brand canon one click away and the "how/proof/cost" surfaces grouped underneath, not competing for top billing._

---

## 2. IA critique — why the current 9-item flat list is confusing

The current order is: `Brandolph · Discovery · Brand Intelligence · Briefs · Specialists · Canvas · Human craft · Credits · Settings`.

**Problem A — No grouping; nine peers of equal weight.** A flat list gives the launchpad (the product) the same visual rank as Settings. The user cannot tell what is core vs. occasional vs. account-level. The Sidebar component _already_ renders an eyebrow section label ("Workspace") and supports a second one ("Brandolph" status block) — so grouped sections are feasible today with no new component work.

**Problem B — The first three items overlap and read as three doors to the same room.**
- `home` (Brandolph) already _reads the BIO, sharpens, and shows the BIO chip with a "View full BIO →" link_ (see `portal-brandolph.jsx`, `BioChip`).
- `discovery` is the **one-time intake** that _produces_ the BIO (3-step Connect/Extract/Confirm, ending in "Activate brand space" then "Open Brandolph"). It is onboarding, not a recurring destination — yet it sits permanently as nav item 2.
- `bio` (Brand Intelligence) is the **viewer/editor** of what Discovery produced.

So Discovery and Brand Intelligence are the _input_ and the _artifact_ of the same thing (the brand canon), and they're listed as two separate top-level peers next to each other. A new user cannot tell "Discovery" (a verb/flow) from "Brand Intelligence" (a noun/object). Worse, both compete with the home for attention even though the home is where the actual work happens. Discovery is essentially a wizard that should live _under_ the BIO, not beside it.

**Problem C — Briefs is separated from the home that creates it.** Briefs is the library of outputs from the loop and is currently item 4, after two onboarding/canon items. The loop's two halves (compose at `home`, review at `briefs`/`brief-detail`) are split by the brand-canon items wedged between them. They should be adjacent, at the top, as one "do the work" group.

**Problem D — Specialists and Canvas are "proof," not daily tools, but sit mid-list as if core.** `Specialists` (the 33-agent directory) and `Canvas` (a node graph of how BIO → brief → territories → outputs connect; note the source comments it's a _"Phase 3 placeholder, but designed"_) are both _explanations of how the magic works_. They support the "senior operator, not a prompt box" story, but a subscriber doesn't visit them to get work done. Placed at items 5–6 they imply daily relevance they don't have, and they push the cost/account items (Credits, Settings) to the bottom where Credits — which is load-bearing for a _subscription_ product — gets buried.

**Problem E — Credits is both a footer widget AND a nav item, and it's buried at #8.** The Sidebar footer already shows a credits meter with "View ledger →" (`onNav("credits")`). That's good — credits awareness should be ambient. But for a subscription whose entire pricing model is the credit pool, the _ledger/top-up_ destination sitting at nav slot 8 (below Specialists, Canvas, Craft) under-serves the business model. It should be grouped with account/billing concerns and clearly reachable, with the ambient meter remaining in the footer.

**Net effect:** the menu reads as an undifferentiated tool list. It hides the loop (the product), duplicates the brand-canon entry, and ranks "proof" surfaces above the business-critical credits surface. The hierarchy doesn't tell the story the USP wants told.

---

## 3. Proposed IA — grouped client nav

Three labelled sections using the existing eyebrow-label pattern. Route ids unchanged so routing/guards in `portal-shell.jsx` keep working — this is a **regroup + reorder + 2 renames + 1 demotion**, not a rebuild.

```
WORKSPACE                         ← section eyebrow (the daily loop)
  • Create        → home          (renamed in nav from "Brandolph")
  • Briefs        → briefs        (also matches brief-detail, already handled)

BRAND                             ← section eyebrow (the canon)
  • Brand Intelligence → bio      (the BIO viewer/editor = the canon home)
        └ Discovery   → discovery (demoted: entry-point from inside BIO / onboarding, not a top-level peer)

INTELLIGENCE                      ← section eyebrow (how it works · proof)
  • Specialists   → specialists   (the 33 agents — proof of the team)
  • Canvas        → canvas         (how work connects — proof of method)
  • Human craft   → craft          (hand-off to L3 humans)

ACCOUNT                           ← section eyebrow (cost + settings)
  • Credits       → credits        (ledger / top-up — the subscription's spine)
  • Settings      → settings
```

Footer (unchanged): the ambient **Credits meter + "View ledger →"** stays. The "Brandolph is active" status block stays under WORKSPACE.

### What changes per item

| Item | Route id | Action | Where it goes |
|---|---|---|---|
| Brandolph | `home` | **Rename** label to **"Create"** (or "Brandolph · Create"); keep as #1 | WORKSPACE |
| Briefs | `briefs` | **Move up** to #2, directly under Create | WORKSPACE |
| Brand Intelligence | `bio` | Keep; becomes the head of the BRAND group | BRAND |
| Discovery | `discovery` | **Demote** — remove from top-level nav; reach it from inside the BIO ("Re-extract / Run discovery") and from onboarding. Route stays valid. | BRAND (sub-view) |
| Specialists | `specialists` | **Move down** into proof group | INTELLIGENCE |
| Canvas | `canvas` | **Move down** into proof group | INTELLIGENCE |
| Human craft | `craft` | **Move down** into proof group (it's the L3 hand-off, conceptually part of "how it gets made") | INTELLIGENCE |
| Credits | `credits` | **Move up** out of the bottom mush into a clear ACCOUNT group | ACCOUNT |
| Settings | `settings` | Keep last | ACCOUNT |

**Optional (only if you want to go further):** merge `canvas` into the brief-detail view as a "Map" tab rather than a standalone nav item, since Canvas is per-brief work-graph proof and is flagged a Phase-3 placeholder. If you do, INTELLIGENCE shrinks to Specialists + Human craft. Listed as optional because it's a screen change, not just a nav regroup.

---

## 4. Rationale per decision (tied to the USP)

- **Create + Briefs grouped at top (WORKSPACE):** the subscription _is_ the brief→ship loop; the two halves of that loop must be the first thing seen and must be adjacent.
- **Rename "Brandolph" → "Create":** "Brandolph" is a persona, not a job; a subscriber buying creative-on-demand scans for the verb. (Keep the Brandolph identity in the hero/avatar, which already carries it.)
- **Discovery demoted under BIO:** Discovery is a one-time _intake that produces_ the canon; keeping it as a permanent top-level peer duplicates the brand-canon door and confuses a verb (flow) with a noun (object). It belongs as an action inside Brand Intelligence.
- **Brand Intelligence as the single BRAND door:** one place for "what Brandolph judges the work against" — the canon the whole "shape not produce" promise depends on.
- **Specialists / Canvas / Human craft grouped as INTELLIGENCE (proof):** these sell "senior operator with a real team," but they aren't the daily loop; grouping them as "how it works" keeps the proof without letting it outrank the work.
- **Credits promoted into ACCOUNT:** for a credit-pool subscription, the ledger/top-up is business-critical and shouldn't rank below proof surfaces; the ambient footer meter keeps spend always visible without making Credits a daily tab.
- **Settings last:** standard account hygiene; lowest daily relevance.

---

## 5. Implementation note (for you)

All changes are concentrated in `src/portal-shell.jsx`. No screen-component logic needs to change for the core reorg.

1. **Add a `section` field to `CLIENT_ROUTES`** so the Sidebar can render grouped eyebrows. Example shape:
   ```js
   const CLIENT_ROUTES = [
     { id:"home",        label:"Create",             icon:"sparkles", section:"Workspace" },
     { id:"briefs",      label:"Briefs",             icon:"brief",    section:"Workspace" },
     { id:"bio",         label:"Brand Intelligence", icon:"bio",      section:"Brand" },
     { id:"specialists", label:"Specialists",        icon:"team",     section:"Intelligence" },
     { id:"canvas",      label:"Canvas",             icon:"canvas",   section:"Intelligence" },
     { id:"craft",       label:"Human craft",        icon:"craft",    section:"Intelligence" },
     { id:"credits",     label:"Credits",            icon:"credit",   section:"Account" },
     { id:"settings",    label:"Settings",           icon:"settings", section:"Account" },
   ];
   // discovery removed from this array (route still served by ScreenRouter)
   ```
2. **Sidebar render loop:** currently it prints a single `"Workspace"` eyebrow then maps all routes. Change to group by `section` (e.g. reduce into ordered groups, or just render an eyebrow whenever `section` changes from the previous item). The eyebrow markup already exists — reuse `<div className="eyebrow" style={{padding:"4px 12px 8px"}}>{section}</div>`.
3. **Keep `discovery` reachable without a nav item:**
   - It's still in `ScreenRouter` (`case "discovery"`) and the route guard's `isClientRoute` check uses `CLIENT_ROUTES.some(...)` — **removing `discovery` from `CLIENT_ROUTES` will break the guard** (it'll bounce `#/discovery` back to `home`). Fix: add `|| route.id === "discovery"` to the `isClientRoute` expression in the `useShellEffect` guard, mirroring how `brief-detail` is already special-cased.
   - Add the entry points: in `BioViewer` (`portal-discovery.jsx`) wire the existing "Re-extract" buttons / a "Run discovery" action to `go("discovery")`; onboarding already routes into it.
4. **Rename labels only** (`home` → "Create"). Do **not** change route ids — `TopBar.titles`, the guard, and `ScreenRouter` all key off ids. Optionally update `TopBar.titles.home` crumb/label to match "Create".
5. **Credits footer meter:** leave the footer widget and its `onNav("credits")` link as-is; it's the ambient spend signal and complements the promoted Credits nav item.
6. **Team portal:** out of scope for this pass, but apply the same principle later — `team` (Job queue) is the team's loop and is correctly first; `team-capacity` / `team-clients` are context; `team-me` (earnings) is the team's "Account." A single "Team" eyebrow is fine for four items; only group if the list grows.
7. **Optional Canvas-as-tab** (see §3): if pursued, remove `canvas` from `CLIENT_ROUTES`, add a "Map" tab inside `BriefDetail`, and add `|| route.id === "canvas"` guard handling (or drop the standalone route). Defer unless you want it now.

**Risk callout:** the only behavioral gotcha is the route-guard bounce on demoted routes (`discovery`, and `canvas` if you tab it). Patch the `isClientRoute` test in the same commit as the `CLIENT_ROUTES` edit or those URLs will redirect to home.

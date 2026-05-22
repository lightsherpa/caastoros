# Specialists — terminology rename + feature build-out plan

_Status: PLAN (not yet implemented). Awaiting go-ahead + scope confirmation._

## 0. Glossary decision (do this first — it governs every rename)

The product has three layers. The word "agent" today is used for **L2**, but it's inconsistent (the assembly panel already says "specialists"). Lock the vocabulary:

| Layer | What it is | Canonical term | Never call it |
|---|---|---|---|
| **L1** | The AI operator | **Brandolph** | an agent |
| **L2** | The 33 AI specialists | **Specialist(s)** | "agent(s)" |
| **L3** | The human creatives | **the team / team members** | "specialists" |

**Key call:** L2 → **"Specialist"** (matches the existing `Specialists` nav + screen). Do **not** rename L2 to "team members" — that term belongs to the L3 humans in the team portal, and conflating them breaks the core "AI specialists + human team" story. So: _agent → specialist_, and _team/team member_ stays reserved for L3.

## 1. Terminology audit (current state)

~91 "agent" mentions. They split into three buckets:

- **UI-visible copy** (~15 strings) — safe to change, highest impact. Examples:
  - `portal-briefs.jsx:250` `eyebrow="L2 · 33 senior agents"` → "L2 · 33 senior specialists"
  - `portal-briefs.jsx:44` table header `"Agents"` → "Specialists"
  - `portal-briefs.jsx:219` `"… {n} agents"` → "specialists"
  - `portal-briefs.jsx:279` `"{n} agents · {n} live"` → "specialists"
  - `portal-briefs.jsx:19` brief sub "…with the agents that executed it" → "specialists"
  - `portal-shell.jsx:253` topbar title `"Specialists · 33 agents"` → "Specialists · 33 specialists" (or "· 33 on shift")
  - `portal-shell.jsx:428` tweak `"Assembly density (agents in run)"` → "(specialists in run)"
  - `portal-craft.jsx:266` ledger filter `"L2 · Agents"` → "L2 · Specialists"
  - `portal-craft.jsx:323` settings sub "…every agent" → "every specialist"
  - `portal-shared.jsx:193` OutputCard fallback `"Agent"` → "Specialist"
- **Code identifiers** (~45) — mechanical, optional, for internal consistency: `CI_AGENTS` (13), `agentId` (25), `AgentCard` (5), `.agent-card` CSS class, `brief.agents` arrays in data, local `agents`/`a`/`agent` vars.
- **Data keys** — `CI_AGENTS`, `briefs[].agents: [...]`, `outputs[].agentId`. Renaming these touches data + every consumer.

`CI_DEPTS` / `CI_DEPT_COLORS` are about *departments*, not "agents" — leave them.

## 2. Feature build-out (current baseline → target)

**Baseline today** (`SpecialistsDirectory` + `SpecialistDrawer` in `portal-briefs.jsx`):
- Grid grouped by department, department filter pills, count chips.
- Detail in a **drawer**: the job, model chip + summarised system prompt (team only), 30-day usage stats (mock), example outputs for the brand.
- `AgentCard` is the atomic unit (also used in assembly + brief detail).
- Data per specialist is thin: `id, code, dept, name, job, model, cr, status`.

**Proposed enhancements (phased):**

1. **Data depth.** Enrich each specialist record: `blurb` (one-liner), `capabilities[]` (3–5 tags), `bestFor` (when Brandolph picks them), `turnaround`/SLA, `tierFrom` (which subscription tier unlocks it), `sampleOutputIds[]`, optional `avatar`/initials. Keep `model` team-only.
2. **Directory UX.** Add **search** (name/dept/capability), **sort** (department · credits · most-used), a **grid/list toggle**, a clearer "coming soon" state for the 6 non-live, and a "most-used for your brand" rail at top. Keep the staggered reveal already in place.
3. **Specialist detail.** Two options — confirm one:
   - (a) Keep the **drawer**, but enrich it (capabilities, "Brandolph picks me when…", sample outputs, model routing on team side).
   - (b) Promote to a **route** `#/specialists/:id` (deep-linkable, room for more). _Recommend (a) now, (b) later_ — the drawer is faster and the directory is browse-first.
4. **Assembly integration (the payoff).** "Add to next assembly · {cr} cr" currently does nothing. Wire a small **pending-assembly store** (window-scoped, like `__CI_PORTAL`, or a tiny context) that the Create/Console composer reads, so adding a specialist actually shows up in the run the user is about to brief. This connects the directory to the core loop.
5. **Cross-links.** From a brief's specialist chips and from each Library/OutputCard ("produced by {specialist}") → open that specialist's detail.
6. **Client vs team.** Preserve the existing split — client sees specialist + department (no model/routing); team sees model chip + system-prompt summary. Extend it to the new fields (capabilities shown to both; routing/prompt team-only).

## 3. Sequencing (milestones)

- **M1 — Glossary + UI copy rename.** Change the ~15 visible strings + `.agent-card`→`.specialist-card` (or alias). No data/identifier churn. Ship first; instantly fixes the inconsistency. ~30 min, low risk.
- **M2 — Data enrichment + directory UX.** Add the new specialist fields to `CI_AGENTS`, build search/sort/list toggle, enrich the card. Medium.
- **M3 — Detail + assembly integration.** Enrich the drawer (or add the route) and wire the pending-assembly store into the composer. Medium; this is where it stops being a static directory.
- **M4 — (optional) Code identifier rename.** `CI_AGENTS→CI_SPECIALISTS`, `agentId→specialistId`, `AgentCard→SpecialistCard`, `brief.agents→brief.specialists`. Do atomically with a temporary back-compat alias on `window` so nothing breaks mid-refactor. Pure consistency; no user-visible change.

## 4. Risks / decisions to confirm before building

1. **Vocabulary:** confirm L2 = "Specialist" and "team/team member" stays L3-only (per §0).
2. **Scope of rename:** UI copy only (M1) vs. also code identifiers (M4)?
3. **Detail surface:** enriched drawer (recommended) vs. dedicated route.
4. **Assembly store:** OK to add a small window/context store shared between Specialists and the Create composer? (needed for "Add to assembly" to be real.)
5. The "33" count is **accurate** (33 records exist) — no reconciliation needed.

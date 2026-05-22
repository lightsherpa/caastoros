# Specialist creation & prompting — plan

_Status: PLAN. How an L2 specialist is defined, prompted, routed, and authored. Builds on the data shapes already in `portal-data.js` (`CI_AGENTS`, `CI_DEPT_META`, `CI_MODELS`, `CI_BRAND`/BIO) and the drawer's "System prompt · summarised" placeholder._

## 1. What a specialist *is* (the record)

Today each `CI_AGENTS` entry is display metadata: `id, code, dept, name, job, model, cr, status`. To make a specialist *runnable*, extend the record (or a parallel `CI_SPECIALIST_SPECS` map keyed by id) with a **prompt spec**:

```
{
  id, code, dept, name, model, cr, status,        // existing
  role,            // one-line identity ("a conversion copywriter who…")
  objective,       // what a good run produces
  inputs: [...],   // what it reads: ["BIO", "brief", "prior outputs", "uploads"]
  method: [...],   // ordered steps the specialist follows
  outputContract,  // shape/length/format it must return + how it's judged
  refusals: [...], // hard "won't do" rules (brand + safety)
  voice,           // voice constraints (inherits brand voice, may narrow)
  modelRouting,    // primary model + fallback + why
  tools: [...],    // e.g. ["Exa search","image-gen","none"]
}
```

`CI_DEPT_META` already gives department-level **capabilities / bestFor / turnaround / tierFrom** — the per-specialist spec narrows those to the individual.

## 2. The prompt is assembled, not authored as one blob

A specialist's effective system prompt is **composed at run time** from four layers, so brand truth lives in one place and specialists stay small:

```
[ PLATFORM PREAMBLE ]   constant — "you are an L2 specialist inside Caastor
                        Intelligence; Brandolph (L1) routed this brief to you;
                        you do not chat, you produce a deliverable."
        +
[ BRAND CONTEXT (BIO) ] injected from the Brand Intelligence Object: positioning,
                        voice, audience, mandatories, the forbidden-words list,
                        the pricing formula — the canon every output is judged on.
        +
[ SPECIALIST SPEC ]     role · objective · method · outputContract · refusals · voice
                        (the per-specialist fields above)
        +
[ TASK CONTEXT ]        the sharpened brief + relevant prior outputs/uploads for THIS run.
```

This mirrors the drawer's summarised prompt ("You are a {name}. You read the Brand Intelligence Object before responding. You write with conviction and refuse outputs that contradict the BIO…") — that sentence is the seam between PLATFORM PREAMBLE and BRAND CONTEXT, made real.

**Why layered:** the BIO changes (re-run discovery) without touching 33 specs; refusals can be set globally (brand) and extended per specialist; voice is inherited then narrowed.

## 3. BIO grounding & refusals (the "shape not produce" guarantee)

- Every prompt **must** carry the BIO slice relevant to the department (Copy gets voice + forbidden words; Design gets palette + type; Concept gets positioning + audience).
- **Refusal rules** are first-class, not vibes. They already show up in the QA output ("No use of 'unlock' or 'limited'. Annual price respects 11.4× formula. Voice drift index 0.14 ≤ 0.20."). Encode them as a machine-checkable list on the brand + per specialist, and have the **Brand Consistency QA specialist (a24)** run them as a gate before an output is marked `approved`.
- Surface refusals in the UI: the drawer's "Reveal full prompt (admin only)" expands to show PLATFORM + BIO + SPEC; a "Refusals" section lists the won't-dos in plain language for the client.

## 4. Model routing

- `CI_MODELS` already maps each specialist to a model with a brand colour (team-only visibility). Make routing explicit in the spec: `modelRouting: { primary, fallback, reason }`.
- **Client side:** hidden (they see "Specialist", not the model). **Team side:** shown via `ModelChip` + a one-line "routed to Opus because this needs long-context positioning judgment."
- Routing belongs to the spec, not hardcoded in components — so changing a specialist's model is a data edit.

## 5. Authoring flow (how a new specialist gets created)

Phased, smallest-useful-first:

- **A — Admin authoring screen (team portal).** A "New specialist" form: identity (name, dept, code auto-suggested), the spec fields (role/objective/method/outputContract/refusals/voice), model routing, credit cost, tier, status (draft → live → soon). Live **prompt preview** pane that assembles the four layers against the current BIO so the author sees the real composed prompt.
- **B — Test harness.** "Dry run" the specialist against a sample brief + the BIO; show the output and run the QA refusal gate on it. Iterate before setting `status: "live"`.
- **C — Versioning & governance.** Specs are versioned; changing a live specialist creates a new version with a diff; the BIO version it was tested against is recorded. Ties into Settings → "rules that hold across every brief, every specialist."
- **D — Brandolph-assisted authoring.** Brandolph proposes a spec from a plain-English description ("I need someone who writes launch emails for wholesale buyers") → pre-fills the form → author edits. Closes the loop with the L1 operator persona.

## 6. How this connects to what's built

- The **drawer** is the read view of a spec; "Reveal full prompt" → the composed-prompt preview (§2). Add a "Refusals" + "Reads from BIO" section.
- **Assembly** (Create/Console): when Brandolph assembles a crew, each picked specialist contributes its spec; the run cost = Σ `cr`. This is the M3 "pending-assembly store" hook.
- **Library/outputs** already carry `agentId` + a QA output — wire the QA gate (§3) to set an output's `status`.

## 7. Decisions to confirm before building any of this

1. **Where do specs live** — extend `CI_AGENTS` records, or a separate `CI_SPECIALIST_SPECS` map? (Recommend separate map: keeps the directory list lean, specs load on demand.)
2. **Refusals model** — brand-global list + per-specialist additions? (Recommend yes.)
3. **Authoring surface** — team-portal admin screen (recommend) vs. settings sub-page.
4. **Real vs mock** — this is still a prototype; first build the **composed-prompt preview + spec data** (no backend), then the authoring form, then (later) an actual model call.
5. Whether to do the **code-identifier rename (M4)** before adding specs, so new code uses `specialist*` naming from the start.

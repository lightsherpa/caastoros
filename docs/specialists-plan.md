# Specialists — terminology and expanded-catalog plan

_Status: CURRENT. Reconciled to the current 55-record catalog in `src/portal-data.js`; bespoke prompting is complete for the 49-specialist non-motion/video scope._

## 0. Glossary

| Layer | What it is | Canonical term | Never call it |
|---|---|---|---|
| **L1** | The AI operator | **Brandolph** | an agent |
| **L2** | The catalog of 55 AI workers | **Specialist(s)** | agents in product copy |
| **L3** | Human creatives | **the team / team members** | specialists |

L2 remains "Specialist." "Team member" remains reserved for L3 humans. Legacy identifiers such as `CI_AGENTS`, `agentId`, and `brief.agents` may stay temporarily for compatibility; user-facing copy uses the canonical terms.

## 1. Actual catalog

The prior 33-specialist baseline is obsolete. The source now has **55 specialists across seven departments**:

| Department | Count | Status |
|---|---:|---|
| Strategy | 6 | 6 live |
| Concept | 8 | 8 live |
| Copy | 11 | 11 live |
| Visual | 11 | 11 live |
| Web & UX | 7 | 7 live |
| Motion & Sound | 5 | 5 soon |
| Research & Ops | 7 | 7 live, including 2 internal |

That is **50 live specialists** and **5 coming soon**. `BIO Compiler` (`a30`) and `Audit & Ledger` (`a33`) are live internal specialists and remain in prompt-spec coverage even though the public directory hides them.

### Completion boundary

The current completion scope is 49 specialists, regardless of status. Motion/video is explicitly deferred: the five records in `Motion & Sound` (`a27`, `a28`, `a50`, `a51`, `a52`) plus `a44 Style Frames`, a video-preproduction role housed under Visual. No motion/video provider, runtime, output renderer, or activation work should be counted as part of this completion.

## 2. Current product baseline

The directory already has department grouping/filtering, status/count chips, cards, a detail drawer, usage examples, and client/team visibility differences. Catalog records include directory metadata, while shared capabilities and tier metadata come from `CI_DEPT_META`.

Prompting is now a separate coverage concern:

- `CI_DEPT_SPECS` contains seven department-level fallback templates.
- `CI_SPECIALIST_SPECS` contains bespoke behavior for every in-scope specialist; the test output is the authoritative missing/invalid list if coverage regresses.
- A complete spec includes non-empty `role`, `objective`, `method`, `outputContract`, `voice`, `refusals`, and `bioSlices`.
- `server/src/lib/specialist-spec-coverage.test.mjs` must remain green: every scoped specialist has a complete bespoke spec and every bespoke id belongs to the catalog.

## 3. Feature build-out

1. **Terminology.** Replace stale visible "agent" language and hard-coded counts with "specialist" and catalog-derived counts. Preserve legacy data aliases until consumers migrate atomically.
2. **Spec completion.** Add bespoke core prompt fields for all 49 in-scope specialists, independent of status. Department defaults do not satisfy completion.
3. **Directory ergonomics.** Keep search, department filters, sort, grid/list modes, coming-soon treatment, and internal-record filtering driven by data rather than fixed counts.
4. **Specialist detail.** Keep the drawer for now; expose capabilities, `bestFor`, sample outputs, BIO slices, refusals, and team-only routing/prompt detail.
5. **Assembly integration.** Make "Add to next assembly" update the pending assembly and enforce live/tier eligibility.
6. **Cross-links.** Brief specialist chips and output attribution should open the matching specialist detail.

## 4. Sequencing

- **M1 — Catalog reconciliation.** Remove stale 33/6-department assumptions and derive totals from `CI_AGENTS`.
- **M2 — Prompt-spec coverage.** Author every missing scoped spec and keep the standalone Node gate passing thereafter; use its failure list rather than a hard-coded work queue.
- **M3 — Directory/detail enrichment.** Surface the richer data without exposing model routing to clients.
- **M4 — Assembly integration.** Connect selection, eligibility, credit estimates, and run creation.
- **M5 — Optional identifier rename.** Atomically migrate `CI_AGENTS → CI_SPECIALISTS`, `agentId → specialistId`, `AgentCard → SpecialistCard`, and `brief.agents → brief.specialists`, with temporary compatibility aliases.
- **Deferred — Motion/video.** Specify providers, runtime contracts, renderers, QA, and activation in a separate milestone.

## 5. Completion criteria

- Product and docs recognize 55 catalog entries, seven departments, 50 live, and five coming soon.
- Public UI terminology says "specialist" and count text is data-derived.
- Every in-scope specialist, including internal or future non-live records, owns a complete bespoke prompt spec.
- Every bespoke spec id resolves to a catalog record.
- The coverage test passes without counting a department fallback as bespoke.
- All six motion/video roles, including `a44`, remain outside this milestone's completion claim.

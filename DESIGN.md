# CaastorOS Design System

<!-- impeccable:design-schema 1 -->

## Visual Thesis

CaastorOS is a serious operating system for brand work. The interface is the proof: a reviewed brand source becomes a better brief, an approved specialist crew, and traceable output.

The marketing surface pairs bold editorial typography with real product evidence. It should feel direct, controlled, and commercially ready—never like an abstract AI concept, a creative-agency mood board, or a decorative machine.

## World

The durable visual world is **product evidence under editorial direction**.

- White is the primary reading field.
- Near-black ink carries the argument and frames product evidence.
- Caastor yellow marks decisions, selected states, approval, and the single primary action.
- Actual CaastorOS interface captures demonstrate the workflow.
- Hard edges, strong dividers, and generous negative space create authority.
- Human review is stated plainly in copy rather than represented through metaphor.

## Color Strategy

Use one saturated action color against disciplined neutrals.

| Role | Value |
|---|---|
| Primary action / selected state | `#f4c900` |
| Ink | `#11110f` |
| White | `#ffffff` |
| Soft field | `#f2f2ed` |
| Line | `#d7d7cf` |
| Muted copy | `#5d5d56` |

Yellow must identify an action, a selected product state, or a decisive section. Do not scatter it as decoration. Avoid gradients, glows, secondary accent colors, and low-contrast grey-on-grey compositions.

## Typography

- Display typography is condensed, forceful, and short enough to scan at a glance.
- Body typography is a highly legible humanist sans with open counters and comfortable multilingual spacing.
- Operational labels use compact uppercase sans lettering.
- Headlines make one claim. Supporting copy explains the mechanism in plain language.
- Important copy remains semantic HTML and is never rasterized.

The web implementation uses `"Avenir Next Condensed"`, `"Arial Narrow"`, and `"Roboto Condensed"` as its display stack, with `"Avenir Next"`, Avenir, and platform sans fallbacks for body copy.

## Composition

The page follows one conversion argument:

1. Promise: turn brand knowledge into work the team can trust.
2. Product evidence: show the reviewed source, improved brief, and traceable work.
3. Mechanism: explain the three-step operating flow.
4. Outcomes: clarify what changes for the marketing team.
5. Trust: show where human judgment controls the system.
6. Pilot: qualify and capture one real business need.
7. FAQ: resolve the five objections most likely to block application.

Desktop uses a two-column hero with the value proposition and real interface sharing the first viewport. Mobile preserves the same order in one column. Sections alternate between quiet white, decisive black, and a yellow conversion field.

## Components and States

- Navigation is a simple white rail with a visible active section.
- Primary buttons are solid yellow rectangles with black type.
- Secondary links are underlined text actions.
- Product walkthrough tabs are rectangular, use real WAI-ARIA tab behavior, and update the evidence synchronously.
- Product captures sit in hard-edged frames with minimal labeling.
- Forms use persistent labels, rectangular fields, inline validation, and an explicit local-preview success state.
- FAQ uses native disclosure behavior.

Do not create standalone containers when a divider, spacing change, or typography shift can express the same hierarchy.

## Motion

Motion is functional and restrained.

- The product walkthrough may use a brief opacity transition between real interface states.
- Navigation may indicate the current section.
- The mobile pilot CTA may appear after the hero and disappear within the pilot section.
- `prefers-reduced-motion` removes nonessential transitions.
- No ambient floating, decorative parallax, shimmer, scrolling spectacle, or looping AI effects.

## Responsive Behavior

- Desktop: value proposition and product interface share the hero; workflow steps use broad horizontal rhythm.
- Tablet: hero stacks when the evidence would become too small to read.
- Mobile: one clear column, full-width primary action, legible product crops, and a compact sticky pilot CTA.
- The surface must have no horizontal overflow at 320px.
- Primary controls meet a 44×44px touch target.
- English and Spanish controls remain available in mobile navigation.

## Accessibility

- WCAG 2.2 AA contrast is the minimum.
- Every interactive control has a strong `:focus-visible` state.
- The product walkthrough supports pointer, touch, arrow keys, Home, and End.
- Visible content updates remain synchronized with ARIA selection.
- Mobile navigation exposes its expanded state and closes with Escape.
- Errors identify invalid fields and move focus to the first problem.
- Success messaging receives focus without submitting test data.
- The page remains usable without motion and at 200% zoom.

## Imagery and Evidence

- Real product interface captures are the primary visual evidence.
- Each image must demonstrate a named stage in the workflow.
- Founding-team experience must be explicitly labeled as founding-team experience.
- Do not fabricate customer logos, testimonials, performance metrics, pricing, or product capabilities.

## Removed Complexity

The following concepts were deliberately removed because they made the MVP harder to understand:

- The paper Crew Machine, chassis, crank, linkage, and workshop metaphors.
- A separate specialist-console section.
- Repeated proof sections that restated the same source-to-output flow.
- Plans and pricing structures unsupported by the private-preview offer.
- Multiple competing conversion paths.
- Animation used to explain what direct product screenshots can prove faster.

## Prohibitions

- No decorative metaphor before product comprehension.
- No generic floating SaaS card grid.
- No black-neon command center or AI glow.
- No mascot-led narrative.
- No rounded pill for every container.
- No jargon-first copy.
- No secondary conversion goal competing with the pilot.
- No invented proof, pricing, testimonials, customer marks, or submission endpoints.
- No proprietary term before its plain-language explanation.

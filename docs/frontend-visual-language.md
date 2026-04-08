# Frontend Visual Language

This document is the source of truth for the `frontend/` (legacy) visual and interaction language.

> **Scope**: This document applies to `frontend/` only. For `frontend-next/`, see `docs/frontend-next-visual-language.md`.

## Default Direction

The default direction is an industrial production workbench for manufacturing and APS workflows.

It is not a marketing site, not a consumer product shell, and not a large-screen command center.

This direction applies to both `frontend/` and `frontend-next/`. Different stacks may implement it differently, but they should converge on the same interaction and visual semantics.

## Style Goals

- Keep the interface optimized for high-frequency operational work.
- Make status, constraints, and next actions readable at a glance.
- Support dense information without turning pages into visual noise.

## Page Principles

- Filters come first when users must narrow production, scheduling, run, or batch scope.
- Data comes before decoration; layout should help comparison, scanning, and exception handling.
- State comes before flourish; loading, empty, error, success, disabled, and warning states must be explicit.
- Primary and secondary actions must be visually distinct, and dangerous actions must be explicit.

## Visual Principles

- Use a light overall tone as the default baseline.
- Prefer clear region separation, stable alignment, and limited visual hierarchy depth.
- Use accent color sparingly to mark status, focus, and primary actions.
- Keep decoration restrained; blur, frosted surfaces, and ornamental motion are not default treatments.

## Geometry And Surface

- Low-radius, engineering-oriented geometry is the default. Rounded corners help recognition and hit targets, not branding; pill or capsule forms are exceptional, including status labels.
- Tables, matrices, gantts, filter bars, inspector panels, and monitoring cards should favor stable edges and density over soft silhouettes.
- Layout, borders, contrast, and region separation should carry hierarchy before shadows or decorative backgrounds do.
- Blur, frosted glass, ornamental gradients, and visibly floating cards are not default treatments for business content surfaces. Small meta surfaces may use light identity treatment, but business content should not inherit it by default.

## Density, Typography, And Overflow

- High-frequency work requires high information density. Do not spread compact information across large cards, wide gaps, oversized controls, or decorative empty space just to create a more "premium" feel.
- If a small element can complete the task clearly, do not enlarge it without a task-driven reason.
- Font size, weight, and line height must match information priority; avoid oversized headlines, loud secondary copy, tiny body text, and aggressive tracking for normal Chinese reading.
- Text, numbers, labels, table headers, chart annotations, button labels, and tabs must have explicit overflow behavior. Wrapping, truncation, scrolling, fixed-width columns, and multi-line layouts are all valid when chosen intentionally.
- Silent overflow, accidental clipping, overlap, or layout stretching are correctness problems, not cosmetic issues.

## Layout And Ownership

- Pages should have stable hierarchy, alignment, and region ownership, with filters, status, and primary actions easy to find before heavy data regions begin.
- Default to a single primary scroll container. Nested scroll areas are exceptional and must be clearly bounded.
- Buttons, badges, status badges, tabs, form fields, cards, and table shells should be differentiated by semantics first, not arbitrary shape drift.
- Shared design-system primitives own default geometry, density, and surface language. Feature code should not quietly redefine them through one-off local styling.
- When a shared primitive conflicts with this document, treat the implementation as design-system debt. Do not continue copying the drift into new features.
- Anti-patterns include density loss from whitespace, oversized small-task controls, overflowing content, typography hierarchy mismatch, unnecessary scroll regions, and decorative shells that compete with business content.

## Interaction Principles

- High-frequency actions should stay low-friction and predictable.
- Form, filter, modal, table, and detail-panel behavior should stay consistent across pages.
- Feedback should be immediate and diagnosable, especially for long-running operations and failed submissions.
- Responsive behavior should preserve information hierarchy instead of hiding core state silently.

## Technology Independence

This visual language is independent from any single component library or scaffold.

The current frontend may continue to implement it with Ant Design, and future migrations can keep the same semantics on a different stack.

## Convergence Rule

New pages must follow this document by default.

When editing an existing page, move the touched surface toward this language instead of preserving accidental stylistic drift.

# Frontend Visual Language

This document is the source of truth for the APS frontend visual and interaction language.

## Default Direction

The default direction is an industrial production workbench for manufacturing and APS workflows.

It is not a marketing site, not a consumer product shell, and not a large-screen command center.

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

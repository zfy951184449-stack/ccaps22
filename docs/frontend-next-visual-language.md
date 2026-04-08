# Frontend Next Visual Language

This document is the source of truth for the `frontend-next/` visual and interaction language.

This language is **independent** from `docs/frontend-visual-language.md`, which governs `frontend/` (legacy). The two systems do not share a visual contract.

## Default Direction

A high-density industrial production workbench, purpose-built for biopharmaceutical CMO scheduling and APS workflows.

This is enterprise operational software—not a consumer app, not a marketing site, not a dashboard showcase. Every pixel must earn its place by serving an operator's real task.

## Core Design Principles

### 1. Information Density First

- Scheduling operators work with dozens of batches, shifts, constraints, and exceptions simultaneously. The interface must support scanning, comparing, and acting on dense information without pagination or excessive scrolling.
- Do not spread information across oversized cards or decorative whitespace. Compact layouts are a feature, not a compromise.
- Tables, matrices, Gantt timelines, and status grids are primary content surfaces—treat them as first-class citizens, not afterthoughts.

### 2. At-a-Glance Readability

- Status, constraints, exceptions, and next actions must be readable in under 2 seconds of visual scanning.
- Use color coding systematically: a consistent, limited palette where each color carries unambiguous operational meaning (running, waiting, blocked, locked, exception, completed).
- Avoid decorative color usage. Every color application should encode information.

### 3. Fast, Low-Friction Interaction

- High-frequency actions (filter, drill-down, edit, approve, lock) should require minimum clicks and zero cognitive overhead.
- Keyboard shortcuts and power-user affordances are expected, not optional.
- Forms, filters, modals, and inspectors should behave consistently across all pages.
- Feedback must be immediate: loading, error, success, and disabled states are always explicit—never hidden.

### 4. Effective Data Visualization

- Gantt charts, resource matrices, shift calendars, and constraint visualizations are the core value of the interface. They must be precise, interactive, and information-complete.
- Charts and timelines should prioritize operational accuracy over visual polish.
- Labels, annotations, and axis information must be legible at operational zoom levels.

### 5. Restrained Motion

- Animation exists to communicate state change, not to entertain.
- Permitted: transitions for panel open/close, status change indicators, loading spinners, micro-feedback on interaction (button press, toggle).
- Prohibited: decorative entrance animations, parallax effects, bouncing elements, gratuitous spring physics on non-interactive elements.
- Transition duration should be 150–250ms. Users should never wait for an animation to complete before they can act.

## Visual Language

### Surface and Geometry

- Use a light overall tone as the default baseline. Dark mode is a future consideration, not a current requirement.
- Low-radius corners (4–8px) for engineering-oriented geometry. Rounded corners serve recognition and hit targets, not branding.
- Pill and capsule shapes are exceptional—not defaults—including for status badges.
- Hierarchy is carried by layout, contrast, and region separation—not by shadows, blur, or decorative backgrounds.
- Blur, frosted glass, ornamental gradients, and floating cards are not permitted on business content surfaces.

### Typography

- Use the system font stack (`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`) for maximum rendering performance and OS-native clarity.
- Font hierarchy must match information priority:
  - Section headers: 14–16px, Semibold
  - Body / data cells: 13–14px, Regular
  - Secondary labels / metadata: 12–13px, Medium, reduced opacity
- Avoid oversized headlines, loud secondary copy, or aggressive letter-spacing that disrupts Chinese text reading rhythm.
- Monospace font for numerical data in tables and timelines where alignment matters.

### Color System

- Build a semantic color system, not a decorative one:
  - **Operational status**: running (blue), completed (green), waiting (amber), blocked/error (red), locked (purple/indigo), draft (gray)
  - **Interactive**: primary action (single accent), secondary action (neutral), destructive action (red, explicit confirmation required)
  - **Surface**: background, surface, elevated surface, border—using neutral tones with sufficient contrast
- Accent color used sparingly: primary actions, active states, and focus indicators only.
- All color pairs must meet WCAG AA contrast requirements.

### Layout

- Pages should have stable hierarchy: filters → status summary → primary data surface → detail panels.
- Default to a single primary scroll container. Nested scroll areas are exceptional and must be clearly bounded.
- Consistent region ownership: operations personnel should know where to look for filters, status, and actions without learning each page separately.
- Responsive behavior should preserve information hierarchy—never silently hide core operational state.

### Overflow and Edge Cases

- Every text element, label, and data cell must have an explicit overflow strategy: truncation with tooltip, wrapping, scrolling, or fixed-width columns.
- Silent overflow, accidental clipping, overlapping content, or layout stretching are correctness bugs—not cosmetic issues.
- Handle empty states, loading states, error states, and zero-result states explicitly on every data surface.

## Component Ownership

- `frontend-next/src/design-system/` owns the shared primitives (buttons, badges, inputs, tables, panels, status indicators).
- Feature code (`frontend-next/src/features/`) must not redefine geometry, density, or surface language through one-off local styling.
- When a shared primitive conflicts with this document, treat the implementation as design-system debt—do not copy the drift into new features.

## Technology Independence

This visual language is independent from any single component library. It can be implemented with Tailwind, CSS Modules, styled-components, or any future stack migration.

## Convergence Rule

New `frontend-next/` pages must follow this document by default. When editing an existing page, move the touched surface toward this language.

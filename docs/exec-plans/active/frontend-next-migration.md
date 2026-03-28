# Frontend Next Migration Plan

Status: active - Wave 0 is complete and the Wave 1 `qualifications` pilot is live in `frontend-next`; legacy CRA remains the default runtime while the rest of Wave 1 stays pending.

## Goal

Build `frontend-next/` as an independent Next.js workspace for the Precision Lab migration without changing the default legacy frontend runtime or backend API contracts.

## Scope

- Create the Wave 0 app shell, design-system foundation, route placeholders, test/tooling stack, and independent startup path.
- Deliver the Wave 1 `qualifications` pilot as a redesign-first operating desk with minimal backend support for dependency visibility and safe deletion.
- Keep `frontend/` as the default frontend and keep backend static serving pointed at `frontend/build`.
- Add repo documentation and CI recognition for `frontend-next` without replacing legacy checks.
- Keep later Wave 1 CRUD pages and all business-heavy screens out of scope until the pilot patterns are validated.

## Current understanding / source of truth

- Legacy frontend runtime entry is `frontend/src/App.tsx`; frontend-next runtime entry is `frontend-next/src/app/layout.tsx`.
- Backend runtime entry remains `backend/src/server.ts` and continues to own the `/api` contract surface.
- Repo-level routing, verification, and long-running work tracking rules live in `AGENTS.md`, `.agent/rules/`, and `docs/exec-plans/README.md`.
- `frontend-next` must preserve legacy URLs, remain fully isolated by naming and package boundaries, and enforce a first-party Precision Lab design system.

## Execution steps

### Wave 0 foundation

- [x] Create `frontend-next/` as an independent Next.js app with TypeScript, Tailwind, and App Router.
- [x] Add design-system tokens, primitives, app shell, route registry, and placeholder routes for the current legacy URL surface.
- [x] Add independent tooling: lint, typecheck, Vitest, Storybook, Playwright, environment sample, and API client baseline.
- [x] Add independent startup entry (`start_frontend_next.sh`) while leaving legacy startup scripts unchanged.

### Repo integration

- [x] Add CI recognition and a dedicated `frontend-next` job without changing legacy frontend defaults.
- [x] Update repo docs/rules so agents and humans can discover the new workspace and verification commands.
- [x] Keep backend static serving unchanged until a future explicit cutover wave.

### Future migration waves

- [x] Wave 1 pilot: `qualifications`
- [ ] Wave 1 follow-up: `operation-types`
- [ ] Wave 1 follow-up: `operations`
- [ ] Wave 1 follow-up: `shift-definitions`
- [x] Wave 1 follow-up: `qualification-matrix`
- [ ] Wave 2: `organization-workbench` and `dashboard`
- [ ] Wave 3: `solver-v4`
- [ ] Wave 4: `personnel-scheduling`
- [ ] Wave 5: `process-templates-v2`
- [x] Wave 6 pilot: `resource-planning-v3`
- [ ] Wave 6: `batch-management-v4`

## Decisions and tradeoffs

- `frontend-next/` is the permanent name; no `v2/new` aliases are introduced elsewhere in the repo.
- No code-sharing package is introduced between `frontend/` and `frontend-next/` in Wave 0.
- The new UI stack is first-party and headless-owned; helper libraries are allowed below the design-system boundary, but Ant Design is not.
- The shell is optimized for desktop 1080p/2K density first; mobile parity and dark mode are explicitly deferred.
- The `qualifications` pilot is intentionally not a plain CRUD table: it upgrades the page into an operating desk while keeping route names, terminology, and backend create/update contracts stable.
- Safe deletion is enforced at the backend boundary with `409 QUALIFICATION_IN_USE`; the frontend can explain impact, but it is not the source of truth for delete eligibility.

## Verification

- `cd frontend-next && npm run lint`
- `cd frontend-next && npm run typecheck`
- `cd frontend-next && npm run test:ci`
- `cd frontend-next && npm run build`
- `cd frontend-next && npm run storybook:build`
- `cd frontend-next && npm run e2e`
- `cd backend && npm run build`
- `cd backend && npm run test:ci`
- `cd backend && npx vitest run`
- Keep legacy verification untouched: `cd frontend && npm run build`, `cd frontend && npm test -- --watchAll=false`

Latest executed results on 2026-03-26:

- `cd frontend-next && npm run lint` ✅
- `cd frontend-next && npm run typecheck` ✅
- `cd frontend-next && npm run test:ci` ✅
- `cd frontend-next && npm run build` ✅
- `cd frontend-next && npm run storybook:build` ✅
- `cd frontend-next && npx playwright install chromium` ✅
- `cd frontend-next && npm run e2e` ✅
- `cd backend && npm run build` ✅
- `cd backend && npm run test:ci` ✅
- `cd backend && npx vitest run` ✅
- `./scripts/lint_agent_docs.sh` ✅

## Open risks or follow-ups

- Storybook and Playwright increase CI cost; if runtime becomes excessive, split `frontend-next` checks into smoke vs full-review lanes instead of weakening coverage.
- Some future waves depend on browser-only APIs and must stay behind explicit client boundaries.
- `process-templates` V1 remains legacy-only until there is an explicit business decision to migrate it.
- Final deployment and cutover policy are intentionally deferred; backend static serving must not be repointed in this wave.
- The Playwright smoke currently stubs `/api/health` so shell validation stays deterministic when the backend is offline; deeper contract coverage belongs in later wave-specific tests.
- The `qualifications` pilot now depends on additive backend endpoints (`/api/qualifications/overview`, `/api/qualifications/:id/impact`) and a stronger delete contract; future CRUD pages should prefer the same backend-driven visibility model over client-only heuristics.

## Progress Log

### 2026-03-26: Wave 0 scaffold initialized

- Created `frontend-next/` with independent Next.js runtime, Precision Lab shell, route placeholders, API client, and Wave 0 design-system primitives.
- Added separate startup entry and began repo-level documentation updates while preserving legacy default behavior.
- Deferred all business-page migration work beyond placeholders so the structural decisions can stabilize first.

### 2026-03-26: Wave 0 verification and repo wiring completed

- Added a dedicated `frontend-next` CI lane with lint, typecheck, unit tests, build, Storybook, and Playwright smoke coverage.
- Updated repo docs and rules so `frontend-next` is discoverable without changing legacy startup, static serving, or verification defaults.
- Hardened the Wave 0 shell against Next 16 typed-route and dev-origin constraints, and made the smoke test deterministic with a stubbed health probe.

### 2026-03-26: Wave 1 `qualifications` pilot implemented

- Replaced the `qualifications` placeholder with a redesign-first operating desk that combines qualification inventory, usage visibility, cross-page shortcuts, side-sheet editing, and blocked-delete explanation.
- Added reusable shared patterns for page headers, overview strips, data tables, side sheets, confirmation dialogs, status badges, error states, and toast feedback so later Wave 1 pages can reuse the same operating model.
- Added backend overview/impact endpoints plus delete protection that returns `409 QUALIFICATION_IN_USE` with structured impact data instead of allowing silent or fragile deletes.
- Covered the pilot with backend route tests, frontend unit/component tests, frontend build/lint/typecheck, Storybook build, and Playwright smoke for create/edit/block-delete/delete flows.

### 2026-03-27: `qualification-matrix` integrated into the qualifications desk

- Kept legacy CRA matrix routes and `/api/qualification-matrix` contracts unchanged, while adding additive `/api/qualifications/matrix` and `/api/qualifications/shortages` endpoints for `frontend-next`.
- Expanded the Next `qualifications` route into a tabbed operating desk with `list / matrix / shortages`, and redirected the Next-only `/qualification-matrix` route into the integrated matrix tab.
- Added demand-weighted shortage analysis based on activated batch plans, `required_count`, and qualification level thresholds instead of relying on simple holder counts.

### 2026-03-28: `qualifications` shortages upgraded into a level-risk monitoring desk

- Reworked `/api/qualifications/shortages` so `frontend-next` now reasons over `qualification + required_level` risk items, exposes transparent score breakdowns, and derives qualification-level summaries from the worst qualifying level instead of flattening everything to holder counts.
- Added `/api/qualifications/shortages/monitoring` for management monitoring charts, including risk ranking, supply-vs-demand comparison, level heatmap data, and six-month trend playback under the same scoring model.
- Refactored the Next shortages tab into a monitoring surface with overview cards, chart-linked filtering, and hard-shortage vs high-risk-coverable tables while leaving legacy CRA routes and `/api/qualification-matrix` contracts untouched.

### 2026-03-27: `resource-planning-v3` V3 sandbox route implemented

- Added an independent Next route for the V3 bioprocess sandbox instead of waiting for the legacy-heavy V2/V4 editors to migrate first.
- The page now consumes additive backend V3 endpoints for template listing, legacy-master sync, and process-first preview against a dedicated V3 schema.
- The UI uses a single unified gantt surface with per-equipment main bars, auxiliary bars, and state bands so overview and fine-grain inspection stay on one screen.

### 2026-03-28: `resource-planning-v3` expanded into a no-migration draft workbench

- Refactored the route into a three-tab operating surface: `沙盘 / 设备管理 / 工艺逻辑`, while keeping the URL unchanged.
- Switched the sandbox from auto-query behavior to explicit recompute with local draft storage for pinned equipment, manual state segments, node binding overrides, and main-operation overrides.
- Reused legacy `/api/resources`, `/api/resource-nodes`, and `/api/maintenance-windows` directly in the Next workbench so formal equipment management works before any V3 schema migration is executed.

### 2026-03-28: `design-review` route added for design-system governance

- Added a persistent `/design-review` workspace route so Precision Lab tokens, primitives, patterns, and representative page compositions can be reviewed in the live Next shell instead of only in isolated stories.
- Built the page as a static internal audit surface with an issue ledger that calls out current style drift, including decoration pressure, radius drift, badge semantics overlap, and local one-off styles re-entering feature pages.
- Kept the route independent from backend contracts so it can remain a stable review baseline while the rest of the migration waves continue.

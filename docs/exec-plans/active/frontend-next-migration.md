# Frontend Next Migration Plan

Status: active - Wave 0 scaffold and baseline verification are complete; legacy CRA remains the default runtime and Wave 1 has not started.

## Goal

Build `frontend-next/` as an independent Next.js workspace for the Precision Lab migration without changing the default legacy frontend runtime or backend API contracts.

## Scope

- Create the Wave 0 app shell, design-system foundation, route placeholders, test/tooling stack, and independent startup path.
- Keep `frontend/` as the default frontend and keep backend static serving pointed at `frontend/build`.
- Add repo documentation and CI recognition for `frontend-next` without replacing legacy checks.
- Do not migrate business-heavy screens beyond placeholder reservation in this wave.

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

- [ ] Wave 1: CRUD surfaces (`qualifications`, `qualification-matrix`, `shift-definitions`, `operation-types`, `operations`)
- [ ] Wave 2: `organization-workbench` and `dashboard`
- [ ] Wave 3: `solver-v4`
- [ ] Wave 4: `personnel-scheduling`
- [ ] Wave 5: `process-templates-v2`
- [ ] Wave 6: `batch-management-v4`

## Decisions and tradeoffs

- `frontend-next/` is the permanent name; no `v2/new` aliases are introduced elsewhere in the repo.
- No code-sharing package is introduced between `frontend/` and `frontend-next/` in Wave 0.
- The new UI stack is first-party and headless-owned; helper libraries are allowed below the design-system boundary, but Ant Design is not.
- The shell is optimized for desktop 1080p/2K density first; mobile parity and dark mode are explicitly deferred.

## Verification

- `cd frontend-next && npm run lint`
- `cd frontend-next && npm run typecheck`
- `cd frontend-next && npm run test:ci`
- `cd frontend-next && npm run build`
- `cd frontend-next && npm run storybook:build`
- `cd frontend-next && npm run e2e`
- Keep legacy verification untouched: `cd frontend && npm run build`, `cd frontend && npm test -- --watchAll=false`

Latest executed results on 2026-03-26:

- `cd frontend-next && npm run lint` ✅
- `cd frontend-next && npm run typecheck` ✅
- `cd frontend-next && npm run test:ci` ✅
- `cd frontend-next && npm run build` ✅
- `cd frontend-next && npm run storybook:build` ✅
- `cd frontend-next && npx playwright install chromium` ✅
- `cd frontend-next && npm run e2e` ✅
- `./scripts/lint_agent_docs.sh` ✅

## Open risks or follow-ups

- Storybook and Playwright increase CI cost; if runtime becomes excessive, split `frontend-next` checks into smoke vs full-review lanes instead of weakening coverage.
- Some future waves depend on browser-only APIs and must stay behind explicit client boundaries.
- `process-templates` V1 remains legacy-only until there is an explicit business decision to migrate it.
- Final deployment and cutover policy are intentionally deferred; backend static serving must not be repointed in this wave.
- The Playwright smoke currently stubs `/api/health` so shell validation stays deterministic when the backend is offline; deeper contract coverage belongs in later wave-specific tests.

## Progress Log

### 2026-03-26: Wave 0 scaffold initialized

- Created `frontend-next/` with independent Next.js runtime, Precision Lab shell, route placeholders, API client, and Wave 0 design-system primitives.
- Added separate startup entry and began repo-level documentation updates while preserving legacy default behavior.
- Deferred all business-page migration work beyond placeholders so the structural decisions can stabilize first.

### 2026-03-26: Wave 0 verification and repo wiring completed

- Added a dedicated `frontend-next` CI lane with lint, typecheck, unit tests, build, Storybook, and Playwright smoke coverage.
- Updated repo docs and rules so `frontend-next` is discoverable without changing legacy startup, static serving, or verification defaults.
- Hardened the Wave 0 shell against Next 16 typed-route and dev-origin constraints, and made the smoke test deterministic with a stubbed health probe.

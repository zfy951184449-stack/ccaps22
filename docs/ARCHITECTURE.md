# Architecture Map

This document is the cross-layer navigation map for the APS monorepo.

Use it to decide where to read first before making changes.

## Runtime Entrypoints

- Backend API: `backend/src/server.ts`
- Legacy frontend app shell and routing: `frontend/src/App.tsx`
- Frontend Next app shell and routing: `frontend-next/src/app/layout.tsx`
- Solver V4 service: `solver_v4/app.py`

## Layer Boundaries And Read Order

### Backend / API / DB

Read in this order:

1. `backend/src/routes/`
2. `backend/src/controllers/`
3. `backend/src/services/`
4. `backend/src/models/` and `database/`

Use this lane when changing API contracts, persistence, validation, or orchestration logic.

### Frontend / UI

Read in this order:

1. `frontend/src/pages/` or route entry component
2. `frontend/src/components/`
3. `frontend/src/services/`
4. `frontend/src/types/`

Use this lane when changing screens, interactions, or client-side contract handling.

### Frontend Next / Design System

Read in this order:

1. `frontend-next/src/app/` route entry or layout
2. `frontend-next/src/features/` and `frontend-next/src/design-system/`
3. `frontend-next/src/services/`
4. `frontend-next/src/entities/`

Use this lane when changing the independent Next.js workspace, first-party design system, or frontend-next route shells.

### Solver V4 / Scheduling

Read in this order:

1. `backend/src/services/schedulingV4/DataAssemblerV4.ts`
2. `backend/src/controllers/schedulingV4Controller.ts` and related backend consumers
3. `solver_v4/contracts/`
4. `solver_v4/constraints/` and `solver_v4/core/`
5. apply/result consumers in backend and `frontend/src/components/SolverV4/`

Use this lane when changing request assembly, solver contracts, constraints, apply logic, or result presentation.

## Cross-Layer Contract Hotspots

- V4 scheduling request/response path:
  `backend/src/services/schedulingV4/DataAssemblerV4.ts` -> `backend/src/controllers/schedulingV4Controller.ts` -> `solver_v4/contracts/` -> `solver_v4/core/` -> `frontend/src/components/SolverV4/`
- Shift linkage and status semantics:
  `AGENTS.md`, `docs/LLM_DB_GUIDELINES.md`, and `docs/db-consistency-rules.md`
- Biopharma process semantics:
  `docs/scheduling_principles.md`, `docs/biopharma-cmo-domain.md`, and `docs/biopharma-cmo-rules.md`

## Source-Of-Truth Docs

- Repo-wide routing and hard invariants: `AGENTS.md`
- Active executable rules: `.agent/rules/README.md`
- Database semantics and field traps: `docs/LLM_DB_GUIDELINES.md`
- DB ambiguity clarifications: `docs/db-consistency-rules.md`
- Scheduling semantics: `docs/scheduling_principles.md`
- Biopharma CMO semantics: `docs/biopharma-cmo-domain.md`, `docs/biopharma-cmo-rules.md`
- Multi-step work tracking: `docs/exec-plans/`
- Manual procedures: `.agent/workflows/`

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

MFG8APS (a.k.a. CCAPS22) is a biopharma **APS** (Advanced Process Scheduling) monorepo: it ties process templates, batch plans, personnel rostering, resource constraints, and run monitoring into one system. Domain language and most UI/doc text are **Chinese (生物制药 / CMO)**.

Three independently-run services:

| Service | Stack | Dir | Port |
|---|---|---|---|
| Frontend | React 18 + Ant Design + CRA + TS 4.9 | `frontend/` | 3000 |
| Backend API | Express + TypeScript 5 + MySQL (`mysql2`) | `backend/` | 3001 |
| Solver V4 | Flask + OR-Tools CP-SAT | `solver_v4/` | 5005 |

Wiring: the frontend dev server proxies `/api` → `backend:3001` (`frontend/src/setupProxy.js`). The backend calls the solver over HTTP at `SOLVER_V4_URL` (default `http://localhost:5005`). The browser never talks to the solver directly.

**Read before non-trivial work:** `AGENTS.md` (hard invariants + frontend design-system rules) and `docs/ARCHITECTURE.md` (cross-layer read-order map). For DB/scheduling semantics: `docs/LLM_DB_GUIDELINES.md`, `docs/db-consistency-rules.md`, `docs/scheduling_principles.md`.

## Commands

Run everything (kills stale ports, starts MySQL via brew, then backend → solver → frontend):

```bash
./start_all.sh          # NOTE: README mentions start_v4.sh — that file does not exist; use start_all.sh
```

Per-service:

```bash
# Backend
cd backend && npm run dev          # ts-node-dev hot reload
cd backend && npm run build        # tsc -> dist/
cd backend && npm test             # vitest (watch)
cd backend && npm run test:ci      # CI-safe subset (no DB needed)
cd backend && npm run test:db      # DB integration test (needs a live MySQL)
cd backend && npx vitest run src/tests/<file>.test.ts   # single file
cd backend && npx vitest run -t "test name"             # single test by name

# Frontend
cd frontend && npm start           # CRA dev server
cd frontend && npm run build       # production build (CI=false to ignore ESLint warnings)
cd frontend && npm run test:ci     # jest, non-watch
cd frontend && CI=true npm test -- -t "test name"       # single test

# Solver V4
cd solver_v4 && source .venv/bin/activate && python app.py     # dev (gunicorn in start_all.sh)
cd solver_v4 && python3 -m unittest tests.test_shift_assignment tests.test_share_group  # tests use unittest, NOT pytest
```

Full repo gate (backend build + frontend build + solver compile + solver unit tests):

```bash
./scripts/verify_v4_archive.sh
```

## Architecture

### Backend — layered, read in this order

`routes/` (mount + validation) → `controllers/` → `services/` (orchestration) → `models/` + `database/`. All routes mount under `/api/*` in `backend/src/server.ts`; health is `GET /api/health`. There is also a `domain/` layer holding typed domain contracts split into bounded contexts (`aps/`, `governance/`, `masterData/`, `rosterException/`) plus `mappers/`.

### V4 scheduling pipeline — the critical cross-layer flow

This is the spine of the app and spans all three services. Trace it end-to-end before changing request shape, constraints, or result handling:

```
backend/src/services/schedulingV4/DataAssemblerV4.ts   # assembles the solve request from DB
  → backend/src/controllers/schedulingV4/              # solveOrchestrator, solveLifecycle, SSE progress, apply/precheck
  → solver_v4/contracts/request.py                     # request schema (the contract)
  → solver_v4/core/                                    # solver.py, context.py, callback.py, precheck.py
  → frontend/src/components/SolverV4/                  # presents progress + results
```

Solver endpoints: `GET /api/v4/health`, `POST /api/v4/solve`, `POST /api/v4/abort/:request_id`. Progress streams back to the backend via callback → SSE to the frontend.

### Solver internals

`solver_v4/constraints/` is a **registry of pluggable constraint modules** (`registry.py` + one file per constraint: `locked_operations`, `locked_shifts`, `share_group`, `night_rest`, `night_shift_interval`, `standard_hours`, `consecutive_days`, `unique_employee`, `special_shift_joint_coverage`, …). `solver_v4/objectives/` holds the minimization targets (`minimize_hours`, `balance_night_shifts`, `minimize_vacancies`, …). To add a constraint/objective, add a module and register it — don't inline logic into `core/solver.py`.

### Frontend

`pages/` = route entry components → `components/` (feature components + the `wxb-ui/` design system) → `services/` (API layer) → `types/`. Routes are registered in `frontend/src/App.tsx`.

## Hard rules (easy to violate — enforced in AGENTS.md / .agents/rules/)

**Frontend UI must be built on the `wxb-ui` design system** (`frontend/src/components/wxb-ui/`):
- Use the components, not hand-rolled HTML: `WxbButton`, `WxbInput`/`WxbSearchInput`, `WxbModal`/`WxbDrawer`, `WxbTable`/`WxbDataTable`, `WxbTag`, `WxbBadge`, `WxbEmpty`, `WxbDivider`, `WxbTooltip`, `WxbCheckbox`, etc.
- Colors come from CSS variables only (e.g. `var(--wx-blue-600)`) — **no hardcoded hex**.
- White theme only — no dark theme.
- **No emoji as UI icons** — use inline SVG or `WxbIcon`.

**API access conventions:**
- **No hardcoded API hosts** (e.g. `http://localhost:3001/...`). Use relative `/api/...` paths so the proxy/rewrite handles forwarding.
- Centralize calls in `frontend/src/services/` — don't scatter raw `axios` calls across components for the same data.

## Gotchas

- **Multiple coexisting generations.** Process templates exist as V1/V2/V3, scheduling as V2/V3/V4, gantt as V4/V5. **V4 is the active solve chain.** Confirm which generation a screen/route uses before editing — changing the wrong one is a common mistake.
- **No unified DB migration runner.** SQL lives in `database/migrations/` and is applied manually per environment. The `migrate:*` npm scripts cover only older personnel tables and read `MYSQL_*` env vars, which are a *different* naming scheme than the runtime `DB_*` vars below.
- **No auth/authz/RBAC middleware** is wired up today (despite `domain/governance/rbacTypes.ts` existing).
- **Frontend build emits many legacy ESLint warnings**; `verify_v4_archive.sh` builds with `CI=false` so they don't fail the gate.

## Environment variables

Backend: `DB_HOST` (localhost), `DB_PORT` (3306), `DB_USER` (root), `DB_PASSWORD` (empty), `DB_NAME` (aps_system), `DB_CHARSET`, `HOST` (0.0.0.0), `PORT` (3001), `SOLVER_V4_URL` (http://localhost:5005), `CORS_ALLOWED_ORIGINS` (comma-separated; allows all if unset), `TIANAPI_KEY`/`TIAN_API_KEY` (holiday API).

Resource-feature flags: `ENABLE_TEMPLATE_RESOURCE_RULES`, `ENABLE_BATCH_RESOURCE_SNAPSHOTS`, `ENABLE_RUNTIME_RESOURCE_SNAPSHOT_READ`.

Frontend: `REACT_APP_MONTH_TOLERANCE_HOURS` (default 8).

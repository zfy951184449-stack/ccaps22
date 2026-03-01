# Repository Guidelines

## Project Structure & Module Organization
This monorepo separates the Ant Design React client under `frontend/` from the Express + Vitest API in `backend/`. Inside `frontend/src`, routes stay in `pages/`, shared widgets in `components/`, HTTP adapters in `services/`, and request contracts under `types/`. Backend code is layered with controllers, services, models, and routes in their respective folders, while SQL lives under `database/` and design references stay inside `docs/` and `archive/`.

## Build, Test, and Development Commands
Install dependencies separately (`cd backend && npm install`, `cd frontend && npm install`). Run `cd backend && npm run dev` for the hot-reload API on port 3001, `npm run build && npm start` for the compiled server, and `npm run migrate:metrics|migrate:personnel` whenever the SQL in `database/` changes. The UI workflows use `cd frontend && npm start` for local development, `npm run build` for the production bundle, and `npm test -- --watchAll=false` for deterministic Jest runs.

## Coding Style & Naming Conventions
TypeScript is standard everywhere with 2-space indentation, single quotes, and terminating semicolons (`frontend/src/App.tsx`). React components, pages, and context wrappers use PascalCase, hooks adopt `useCamelCase`, and colocated files should stay inside their feature folder. Backend exports follow the `{Domain}{Controller|Service}` pattern, async/await plus typed DTOs are preferred, and CRA ESLint together with `tsc --noEmit` (or `npm run build`) should run before pushing.

## Testing Guidelines
Backend units and integration flows live in `backend/src/tests` (or adjacent `*.test.ts`) and execute with `cd backend && npm test`; stub `mysql2` pools or rely on supertest when endpoints touch the DB. The frontend inherits Jest via `react-scripts test`, so create `*.test.tsx` next to the component or hook, assert UI state transitions, regenerate snapshots when layouts shift, and explain any coverage gaps in the PR.

## Commit & Pull Request Guidelines
History already uses conventional prefixes (`feat`, `refactor`, `chore`); keep that format (`feat: add auto scheduling endpoint`) and keep bodies concise. Pull requests should summarize scope, list impacted endpoints or routes, mention required migrations or env toggles, attach UI screenshots for visual work, link the issue being closed, and capture the manual verification steps you ran.

## Configuration & Security Notes
Store secrets in `backend/.env` (e.g., `MYSQL_USER`, `MYSQL_PASSWORD`) and share updates via sanitized `.env.sample` entries rather than the real values. The CRA dev server proxies to `http://localhost:3001`, so keep backend ports consistent with `start.sh`, and anonymize any sample data pulled from `database/` or archived queries.

## Codex Working Rules
For Codex sessions, treat repository work as an end-to-end implementation task instead of isolated file editing. Read the affected chain first (`routes/controllers/services/models` for backend, `pages/components/services/types` for frontend, and `assembler/contracts/constraints` for V4 solver work), then make the smallest coherent change that closes the request.

Keep cross-layer contracts aligned whenever API fields, scheduling payloads, or solver inputs change. Use `shift_plan_id` as the source of truth for shift linkage, do not mix Batch/Shift/Run status fields, and serialize `BigInt` values safely in responses. For scheduling or biopharma constraints, prefer explicit validation or `Infeasible` outcomes over silent auto-correction.

Do not treat restarts as verification. Run deterministic checks for the touched area: `cd backend && npm run build`, `cd backend && npm test`, `cd frontend && npm run build`, `cd frontend && npm test -- --watchAll=false`, plus `scripts/verify_v4_archive.sh` for relevant V4 persistence/apply changes. If a check cannot run, state that explicitly in the handoff.

Use the Codex rule split under `.agent/rules/` as the working set:
- `codex-coding-rules.md`: repository-wide base rules
- `codex-backend-api-rules.md`: backend/API/database focused tasks
- `codex-frontend-ui-rules.md`: frontend/UI/interaction focused tasks
- `codex-solver-v4-rules.md`: solver V4 / assembler / apply-result focused tasks
- `codex-runtime-restart-rules.md`: runtime sync and restart rules to avoid stale-process manual test results

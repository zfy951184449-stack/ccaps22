# AGENTS.md

This file is a map, not the full manual.

Keep durable knowledge in versioned repo artifacts that agents can re-read:

- task routing and hard repo-wide invariants stay here
- active executable rules live in `.agent/rules/`
- durable domain and product context lives in `docs/`
- multi-step work and decision logs live in `docs/exec-plans/`
- repeated review feedback should graduate into scripts, tests, or lint rules

## Mission

Treat repository work as an end-to-end implementation task. Read the affected chain first, make the smallest coherent change that closes the request, and verify it with deterministic checks instead of narrative confidence.

Optimize for agent readability:

- the repository is the source of truth
- chat history is not a source of truth
- undocumented decisions effectively do not exist for future runs

## Start Here

1. Identify the task lane and load only the smallest relevant rule set.
2. Read code before proposing structure changes.
3. Update docs in the same change when code semantics or operating rules change.

Task routing:

- Backend / API / DB: read `routes -> controllers -> services -> models/database`, then `.agent/rules/codex-backend-api-rules.md`
- Frontend / UI: read `pages/components -> services -> types`, then `.agent/rules/codex-frontend-ui-rules.md`
- Frontend Next / design-system: read `app routes -> features/design-system -> services -> entities`, then `.agent/rules/codex-frontend-ui-rules.md`
- Solver V4 / scheduling: read `backend assembler -> solver contracts -> constraints/core -> apply/result consumer`, then `.agent/rules/codex-solver-v4-rules.md`
- Runtime sync / local verification: `.agent/rules/codex-runtime-restart-rules.md`
- Planning ambiguity or competing interpretations: `.agent/rules/codex-plan-collaboration-rules.md`
- Biopharma process semantics: use `/Users/zhengfengyi/.codex/skills/biopharma-cmo/SKILL.md`, then `docs/biopharma-cmo-domain.md` and `docs/biopharma-cmo-rules.md`

## Source Of Truth

Read these before inventing new rules:

- `.agent/rules/README.md`: rule index, load order, maintenance policy
- `.agent/rules/codex-coding-rules.md`: base workflow and rules hygiene
- `docs/ARCHITECTURE.md`: cross-layer entrypoints, read order, and contract hotspots
- `docs/README.md`: documentation map for durable repo knowledge
- `docs/frontend-visual-language.md`: frontend visual and interaction language source of truth
- `docs/LLM_DB_GUIDELINES.md`: APS database source-of-truth rules
- `docs/scheduling_principles.md`: scheduling and roster semantics already agreed in-repo
- `.agent/workflows/add-constraint.md`: V4 constraint workflow
- `.agent/workflows/codex-v4-verification.md`: V4 verification workflow
- `.agent/workflows/maintain-rules.md`: rule quality and maintenance workflow
- `docs/exec-plans/`: active plans, completed plans, and tech debt tracker
- `scripts/lint_agent_docs.sh`: structural sanity check for this agent-doc layout

If a decision only lives in Slack, chat, or someone’s memory, it is not reliably available to agents. Move it into the repo.

## Repository Map

- `backend/`: Express + TypeScript API, controllers/services/models/tests
- `frontend/`: CRA + React + Ant Design UI, pages/components/services/types
- `frontend-next/`: Next App Router + Tailwind + first-party Precision Lab design system
- `solver_v4/`: Python solver, contracts, constraints, apply logic
- `database/`: SQL, schema changes, migrations, seed/reference data
- `docs/`: durable knowledge, schema references, scheduling semantics, execution plans
- `.agent/rules/`: active Codex rule set
- `.agent/workflows/`: task-specific workflows that are too detailed for `AGENTS.md`
- `scripts/`: verification, doc generation, and repo utility scripts

## Non-Negotiable Invariants

- Use `shift_plan_id` as the source of truth for shift linkage. Do not drive core logic from `shift_code`.
- Keep Batch, Shift, and Run status semantics separate. Do not mix `plan_status`, `plan_state`, `result_state`, or run `status`.
- Serialize `BigInt` values safely in API responses.
- For invalid scheduling or biopharma constraints, prefer explicit validation errors or `Infeasible` outcomes over silent auto-correction.
- Cross-layer changes are not complete until backend, frontend, and solver contracts are aligned where applicable.
- Restarts synchronize runtime state; they do not prove correctness. Build, test, and scripted checks do.

## Verification Matrix

Run the smallest sufficient deterministic checks for the touched area:

- Backend changes: `cd backend && npm run build`
- Backend logic changes: `cd backend && npm test`
- Frontend changes: `cd frontend && npm run build`
- Frontend interaction/state changes: `cd frontend && npm test -- --watchAll=false`
- Frontend Next changes: `cd frontend-next && npm run build`
- Frontend Next interaction/state changes: `cd frontend-next && npm run test:ci`
- Solver / V4 changes: syntax or test-level validation as applicable
- V4 persistence / apply / archive changes: `scripts/verify_v4_archive.sh`
- Agent-doc structure changes: `scripts/lint_agent_docs.sh`

If a check cannot run, say so explicitly and explain why.

## Handoff Contract

Final delivery should state:

- what changed and why
- which files are the key source files
- which verification commands actually ran
- which checks were not run
- whether runtime restarts were required and whether they were performed
- any residual risk or follow-up needed

## Maintenance Rules

- Keep `AGENTS.md` short. If a section becomes detailed, move it into `docs/`, `.agent/rules/`, or `.agent/workflows/`.
- Prefer progressive disclosure: start from this file, then load only the relevant specialized rules.
- When the same review feedback appears repeatedly, encode it in repo artifacts instead of repeating it manually.
- When a rule can be checked mechanically, prefer a script, test, or lint rule over prose.
- For work that spans sessions or needs decision logs, create an execution plan in `docs/exec-plans/active/` and move it to `docs/exec-plans/completed/` when finished.

---
trigger: always_on
description: Base Codex rules for the APS monorepo. Apply after AGENTS.md and before any task-specific rule files.
---

# Codex Base Rules

This file carries only repo-wide workflow and invariants.

Load order:

1. `AGENTS.md`
2. this file
3. the smallest relevant specialized rule files from `.agent/rules/README.md`
4. linked docs and workflows

## 1. Working Model

1. Treat repository work as end-to-end implementation, not isolated file editing.
2. Read the affected chain before changing code:
   - backend: `routes -> controllers -> services -> models/database`
   - frontend: `pages/components -> services -> types`
   - solver V4: `assembler -> contracts -> constraints/core -> apply/result consumer`
3. Make the smallest coherent change that closes the request.
4. When code semantics change, update the relevant repo docs in the same change.
5. If repeated review feedback keeps appearing, promote it into a rule, workflow, script, test, or lint check.

## 2. Repo-Wide Invariants

1. `shift_plan_id` is the source of truth for shift linkage.
2. Do not mix Batch, Shift, and Run status fields:
   - `production_batch_plans.plan_status`
   - `employee_shift_plans.plan_state`
   - `scheduling_results.result_state`
   - `scheduling_runs.status`
3. Serialize `BigInt` values safely in API responses.
4. For invalid scheduling states, prefer explicit validation failures or `Infeasible` over silent auto-correction.
5. Cross-layer changes are incomplete until backend, frontend, and solver-facing contracts stay aligned where applicable.

## 3. Verification Principles

1. Restarts synchronize runtime state; they do not prove correctness.
2. Prefer deterministic checks over informal manual confidence.
3. Run the smallest sufficient validation set for the touched area:
   - backend: `cd backend && npm run build`
   - backend logic: `cd backend && npm test`
   - frontend: `cd frontend && npm run build`
   - frontend interaction/state: `cd frontend && npm test -- --watchAll=false`
   - V4 archive/apply/persistence: `scripts/verify_v4_archive.sh`
   - agent-doc structure: `scripts/lint_agent_docs.sh`
4. If a check cannot run, report that explicitly with the blocking reason.

## 4. Output Contract

Final delivery should include:

1. what changed and the intended outcome
2. the key files involved
3. the commands actually executed
4. any checks that did not run
5. whether runtime restarts were required or performed
6. residual risk or follow-up

## 5. Keep The Rules Healthy

1. Keep this file short. Push detail into specialized rules, workflows, or docs.
2. Prefer repo-local versioned artifacts over chat-only guidance.
3. If a prose rule can be enforced mechanically, prefer code over documentation.

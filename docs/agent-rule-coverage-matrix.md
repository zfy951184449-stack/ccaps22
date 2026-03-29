# Agent Rule Coverage Matrix

This matrix records which repository areas are currently covered by active rules, supporting docs, and workflows.

Use it to decide whether a new requirement should extend an existing rule, add a workflow, or add a durable doc instead.

## Coverage Matrix

| Area | Status | Primary artifacts | Notes |
| --- | --- | --- | --- |
| Repo routing, hard invariants, verification matrix, handoff contract | Covered | `AGENTS.md`, `.agent/rules/codex-coding-rules.md` | Top-level execution model and non-negotiables are explicit. |
| Active rule governance and quality | Covered | `.agent/rules/README.md`, `.agent/workflows/maintain-rules.md`, `scripts/lint_agent_docs.sh` | Manifest, line caps, section checks, trigger policy, and navigation checks are enforced. |
| Planning and ambiguity management | Covered | `.agent/rules/codex-plan-collaboration-rules.md` | Clarifies when to ask, when to continue, and when to create execution plans. |
| Runtime sync and local restart policy | Covered | `.agent/rules/codex-runtime-restart-rules.md` | Focused on local dev/runtime correctness, not production operations. |
| Backend / API / DB implementation work | Covered | `.agent/rules/codex-backend-api-rules.md`, `docs/LLM_DB_GUIDELINES.md`, `docs/db-consistency-rules.md` | Covers route-to-service reading order, contract stability, DB truth fields, and migration expectations. |
| Frontend / UI / state management work | Covered | `.agent/rules/codex-frontend-ui-rules.md`, `docs/frontend-visual-language.md` | Covers reading order, state boundaries, async states, industrial workbench geometry, surface language, density and whitespace discipline, overflow safety, typography hierarchy, page composition, and feature-level style boundaries. |
| Solver V4 / assembler / apply / result compatibility | Covered | `.agent/rules/codex-solver-v4-rules.md`, `.agent/workflows/codex-v4-verification.md` | Covers modeling redlines, locked data, compatibility, and V4 verification flow. |
| Cross-layer architecture navigation | Covered | `docs/ARCHITECTURE.md` | Gives stable entrypoints, read order, and contract hotspots. |
| DB schema traps and field semantics | Covered | `docs/LLM_DB_GUIDELINES.md`, `docs/db-consistency-rules.md` | Intentionally kept in docs, not active rules. |
| Biopharma CMO process semantics | Covered (docs/skill-backed) | `docs/biopharma-cmo-domain.md`, `docs/biopharma-cmo-rules.md`, external biopharma skill | Intentionally kept as durable references plus skill, not active executable rules. |
| Execution planning and decision logs | Covered | `docs/exec-plans/README.md`, `docs/exec-plans/` | Multi-step work has an explicit in-repo place to live. |
| Database migrations, backfills, and rollback runbooks | Partial | backend rule mentions migration commands | There is no dedicated migration/backfill workflow yet. |
| Layer-specific test design guidance | Partial | `AGENTS.md`, `.agent/workflows/codex-v4-verification.md` | We define what to run, but not a fuller strategy for unit/integration/e2e test design per layer. |
| Observability, monitoring, and production incident handling | Partial | `.agent/rules/codex-runtime-restart-rules.md` | Current guidance is local-dev oriented; production monitoring and incident workflows are not encoded. |
| Security, auth, permissions, and secrets handling | Not covered | none | No dedicated security rule or durable doc is currently surfaced from the agent entrypoints. |
| Performance, scalability, and load/concurrency guardrails | Not covered | none | Only scattered mentions exist; there is no explicit performance rule/workflow. |

## How To Use This Matrix

1. If an area is `Covered`, prefer tightening the existing rule/doc/workflow instead of adding a new top-level rule.
2. If an area is `Partial`, add the missing depth in the right place:
   - executable guidance -> `.agent/rules/`
   - manual procedure -> `.agent/workflows/`
   - durable semantics -> `docs/`
3. If an area is `Not covered`, confirm it is recurring and high-value before adding a new artifact.

## Current Priority Gaps

1. Migration/backfill workflow with rollback checklist
2. Layer-specific test strategy guidance
3. Security/auth/secrets handling guidance
4. Performance and concurrency guardrails

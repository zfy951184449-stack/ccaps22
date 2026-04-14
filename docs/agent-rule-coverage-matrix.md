# Agent Rule Coverage Matrix

This matrix tracks the active agent-doc surface after the context-hygiene cleanup.

The repo now prefers short entry docs, conditional skills, and one optional workflow instead of a large always-on rule bundle.

## Coverage Matrix

| Area | Status | Primary artifacts | Notes |
| --- | --- | --- | --- |
| Repo routing and default read set | Covered | `AGENTS.md`, `.agent/index.md` | These are the only default entry docs. |
| Context hygiene and loading limits | Covered | `.agent/rules/README.md`, `scripts/lint_agent_docs.sh` | Keeps entry docs short and blocks recursive rule loading. |
| Optional workflow structure | Covered | `.agent/workflows/multi-persona-task.md` | Single-agent by default, one optional review pass only. |
| Persona reminders | Covered | `.agent/personas/README.md`, `.agent/personas/` | Lightweight cards only; not an orchestration protocol. |
| Cross-layer architecture navigation | Covered | `docs/ARCHITECTURE.md` | Stable entrypoints and read order. |
| Database and API semantics | Covered | `docs/LLM_DB_GUIDELINES.md`, `docs/db-consistency-rules.md` | Durable semantics stay in docs, not entry prompts. |
| Frontend visual language | Covered | `docs/frontend-visual-language.md`, `docs/frontend-next-visual-language.md` | Read only when the task touches UI. |
| Biopharma process semantics | Covered | `.agent/skills/biopharma-cmo/SKILL.md`, `docs/biopharma-cmo-domain.md` | Skill routes to the minimum required references. |
| Biopharma roster semantics | Covered | `.agent/skills/biopharma-roster/SKILL.md`, `docs/scheduling_principles.md` | Loaded only when workforce logic matters. |
| Execution plans and follow-up tracking | Covered | `docs/exec-plans/README.md`, `docs/exec-plans/` | Durable multi-step work lives here. |
| Security, auth, and secrets | Not covered | none | No dedicated agent-doc artifact yet. |
| Performance and load guardrails | Not covered | none | Still handled ad hoc inside task-specific docs or code. |

## How To Use This Matrix

1. If an area is already covered, tighten the existing doc instead of adding a new always-on rule.
2. Keep default entry docs short; put detailed guidance in conditional docs or skills.
3. If a new area needs repeated handling, prefer a small skill or durable doc over a new persona or workflow.

## Current Priority Gaps

1. Security/auth/secrets handling guidance
2. Performance and concurrency guardrails
3. Migration/backfill runbook guidance

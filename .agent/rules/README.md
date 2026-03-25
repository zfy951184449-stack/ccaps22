---
trigger: always_on
description: Rule index for the APS monorepo. Start here after AGENTS.md to load the smallest relevant rule set and keep durable guidance discoverable.
---

# Rule Index

This directory follows progressive disclosure:

1. Start with `AGENTS.md`
2. Load `codex-coding-rules.md`
3. Add only the task-specific rules you actually need
4. Follow linked docs and workflows instead of growing the base rules

The goal is to keep the entrypoint small and route detail to versioned, inspectable files.

## Active Codex Rule Set

- `codex-coding-rules.md`: repo-wide workflow, invariants, and verification expectations
- `codex-plan-collaboration-rules.md`: when to clarify before committing to a plan
- `codex-backend-api-rules.md`: backend/API/database work
- `codex-frontend-ui-rules.md`: frontend/UI/interaction work
- `codex-solver-v4-rules.md`: solver V4 / assembler / apply-result work
- `codex-runtime-restart-rules.md`: runtime synchronization and restart policy

## Supporting Docs And Workflows

- `../workflows/add-constraint.md`: step-by-step flow for adding a V4 constraint
- `../../docs/LLM_DB_GUIDELINES.md`: APS DB semantics and common schema traps
- `../../docs/scheduling_principles.md`: agreed scheduling principles and roster semantics
- `../../docs/exec-plans/README.md`: how to track multi-step work in-repo

## Domain References

Use these when the task needs deeper context beyond the active Codex rules:

- `biopharma-cmo-domain.md`
- `biopharma-cmo-rules.md`
- `db-consistency-rules.md`
- `codex-v4-verification.md`

For biopharma CMO process semantics, prefer the skill at `/Users/zhengfengyi/.codex/skills/biopharma-cmo/SKILL.md` before expanding repo-local rules.

## Legacy References

The `or-tool*.md` files and `runtime-integrity.md` are retained as older reference material. Prefer the `codex-*` rule set unless a task explicitly needs those older notes.

## Rule Authoring Policy

- Keep `AGENTS.md` and `codex-coding-rules.md` short and routing-oriented.
- Put durable domain knowledge in `docs/` instead of duplicating it across multiple rules.
- Encode invariants and acceptance criteria, not style bikeshedding.
- When guidance repeats in reviews, promote it into a workflow, script, test, or lint rule.
- When a rule becomes stale or conflicts with code, update or delete it quickly. Do not keep zombie guidance.
- Update this index whenever a rule is added, retired, or re-scoped.

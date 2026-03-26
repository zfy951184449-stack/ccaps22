---
trigger: always_on
description: Rule index for the APS monorepo. Start here after AGENTS.md to load the smallest relevant rule set and keep durable guidance discoverable.
---

# Rule Index

This directory is the active executable rule surface for the APS monorepo.

If a Markdown file is not listed in the manifest below, it does not belong in `.agent/rules/`.

Load order:

1. Start with `AGENTS.md`
2. Load `codex-coding-rules.md`
3. Add only the task-specific rules you actually need
4. Follow linked docs and workflows instead of growing the base rules

## Active Manifest

- `README.md` (`always_on`): active rules manifest, load order, and maintenance policy
- `codex-coding-rules.md` (`always_on`): base workflow and rules hygiene; repo-wide invariants stay in `AGENTS.md`
- `codex-plan-collaboration-rules.md` (`always_on`): when uncertainty should trigger clarification
- `codex-runtime-restart-rules.md` (`always_on`): runtime synchronization and restart policy
- `codex-backend-api-rules.md` (`model_decision`): backend/API/database work
- `codex-frontend-ui-rules.md` (`model_decision`): frontend/UI/interaction work
- `codex-solver-v4-rules.md` (`model_decision`): solver V4 / assembler / apply-result work

## Linked Docs

- `../../docs/ARCHITECTURE.md`: cross-layer entrypoints, boundaries, and contract hotspots
- `../../docs/frontend-visual-language.md`: frontend visual and interaction language source of truth
- `../../docs/LLM_DB_GUIDELINES.md`: APS DB semantics and common schema traps
- `../../docs/db-consistency-rules.md`: DB source-of-truth clarifications and ambiguity traps
- `../../docs/scheduling_principles.md`: agreed scheduling principles and roster semantics
- `../../docs/biopharma-cmo-domain.md`: biopharma CMO terminology and hard constraints
- `../../docs/biopharma-cmo-rules.md`: deeper biopharma modeling and rostering semantics
- `../../docs/exec-plans/README.md`: how to track multi-step work in-repo

## Linked Workflows

- `../workflows/add-constraint.md`: step-by-step flow for adding a V4 constraint
- `../workflows/codex-v4-verification.md`: manual verification flow for V4 hardening, apply, and archive-sensitive changes
- `../workflows/maintain-rules.md`: quality bar and change checklist for agent rules/docs

For biopharma CMO process semantics, prefer the skill at `/Users/zhengfengyi/.codex/skills/biopharma-cmo/SKILL.md` before expanding repo-local docs.

## Rule Authoring Policy

- Keep this directory to active executable rules only.
- Keep `AGENTS.md` and `codex-coding-rules.md` short and routing-oriented.
- Put durable domain knowledge in `docs/` instead of duplicating it across multiple rules.
- Put step-by-step manual procedures in `.agent/workflows/`.
- Encode invariants and acceptance criteria, not style bikeshedding.
- When guidance repeats in reviews, promote it into a workflow, script, test, or lint rule.
- When a rule becomes stale or conflicts with code, update or delete it quickly.
- Update this manifest whenever a rule is added, retired, or re-scoped.

# Harness Notes

The in-repo harness is retired.

Use these files as current entrypoints instead:

- `AGENTS.md`
- `.agent/index.md`
- `docs/ARCHITECTURE.md`

## Current Status

- The active agent-doc surface is the minimal `.agent/` tree.
- The old harness entry scripts are retired and removed.
- Do not route work through the old in-repo harness manager; it is no longer part of the supported repo surface.

## Context Hygiene

- Default do-not-reread set: `AGENTS.md`, `.agent/index.md`, `docs/ARCHITECTURE.md`
- Do not recursively scan `.agent/`
- Load `.agent/workflows/multi-persona-task.md` only when the task benefits from one extra review pass

## Validation

- Changes to `AGENTS.md`, `.agent/`, or `docs/` should run `scripts/lint_agent_docs.sh`

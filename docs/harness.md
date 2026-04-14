# Harness Notes

This repository no longer treats the in-repo harness as a default agent entrypoint.

Use these files as current entrypoints instead:

- `AGENTS.md`
- `.agent/index.md`
- `docs/ARCHITECTURE.md`

## Current Status

- The active agent-doc surface is the minimal `.agent/` tree.
- Wrapper scripts such as `scripts/harness_entry.sh` and `scripts/codex_harness_entry.sh` may still exist for compatibility.
- Do not assume a full in-tree harness implementation is present in every checkout.

## Context Hygiene

- Default do-not-reread set: `AGENTS.md`, `.agent/index.md`, `docs/ARCHITECTURE.md`
- Do not recursively scan `.agent/` or `.agents/`
- Load `.agent/workflows/multi-persona-task.md` only when the task benefits from one extra review pass

## Validation

- Changes to `AGENTS.md`, `.agent/`, or `docs/` should run `scripts/lint_agent_docs.sh`

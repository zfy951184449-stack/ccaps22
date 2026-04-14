# Codex Harness Notes

`MFG8APS` no longer relies on a large in-repo prompt bundle for Codex entry.

Use this read order instead:

1. `AGENTS.md`
2. `.agent/index.md`
3. `docs/ARCHITECTURE.md`

## Guidance

- Keep repo-level agent docs short and routing-oriented.
- Prefer conditional skills over always-on role prompts.
- Treat wrapper scripts such as `scripts/codex_harness_entry.sh` as compatibility helpers, not as proof that a full in-tree harness implementation exists.

## Validation

- Doc or agent-entry changes should run `scripts/lint_agent_docs.sh`

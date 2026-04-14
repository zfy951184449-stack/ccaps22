# Codex Harness Notes

`MFG8APS` no longer supports the old in-repo Codex harness.

Use this read order instead:

1. `AGENTS.md`
2. `.agent/index.md`
3. `docs/ARCHITECTURE.md`

## Guidance

- Keep repo-level agent docs short and routing-oriented.
- Prefer conditional skills over always-on role prompts.
- Do not use the old Codex harness entry script; that entrypoint is retired.
- Do not assume the old in-repo harness manager exists or should be restored for normal repo use.

## Validation

- Doc or agent-entry changes should run `scripts/lint_agent_docs.sh`

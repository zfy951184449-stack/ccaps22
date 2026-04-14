# Agent Index

This directory is the active agent-doc source of truth for `MFG8APS`.

Default behavior:

- Read this file only after `AGENTS.md`.
- Do not scan `.agent/` recursively.
- Keep default context to the minimum needed for the task.

## Layers

- `L0` entry: `AGENTS.md`, `.agent/index.md`, `docs/ARCHITECTURE.md`, `docs/README.md`
- `L1` routing and workflow: `.agent/rules/README.md`, `.agent/workflows/multi-persona-task.md`
- `L1` domain skills: the specific skill doc under `.agent/skills/` that matches the task
- `L2` references: the specific files listed by a skill or doc; read only the files you need

## Loading Rules

- Use the workflow doc only when the task is non-trivial and would benefit from one extra review pass.
- Use persona cards only as optional role reminders; they are not a mandatory orchestration protocol.
- Use biopharma skills only when the request depends on bioprocess or roster semantics.
- `.agent/innovations_log.md` is manual reference only. Do not mention it unless the user asks.

## Deprecated Path

- `.agents/` is not active. Ignore it except for migration notes.

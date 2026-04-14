# Execution Plans

Use `docs/exec-plans/` for work that is too large, risky, or long-running to keep only in chat context.

## Layout

- `active/`: plans currently in progress
  - `active/harness-runs/`: historical artifacts from the retired Codex harness
- `completed/`: finished plans kept for historical context
- `tech-debt-tracker.md`: lightweight backlog of cleanup items and follow-ups

## When To Create A Plan

Create a plan when the task:

- spans multiple sessions
- has meaningful uncertainty or decision points
- touches several layers or services
- needs explicit progress tracking or a decision log

Small one-shot fixes usually do not need a dedicated execution plan.

## Suggested Plan Template

Use a Markdown file under `active/` with these sections:

1. Goal
2. Scope
3. Current understanding / source of truth
4. Execution steps
5. Decisions and tradeoffs
6. Verification
7. Open risks or follow-ups

Move the file to `completed/` once the work ships or is otherwise closed.

---
description: 有限状态、单代理优先的可选工作流
---

# Multi-Persona Workflow

This workflow is optional. The default path is still single-agent execution.

Use this workflow only when the task is cross-layer, high-risk, or likely to benefit from one extra review pass.

## Finite State Path

1. `Intake`
   - Confirm the task and success criteria.
2. `Repo grounding`
   - Read the smallest set of files needed to remove ambiguity.
3. `Plan or execute`
   - For planning-heavy work, produce a concrete plan.
   - For straightforward work, execute directly.
4. `Optional review`
   - One reviewer-style pass is allowed if the task changes public contracts, cross-layer behavior, or risky data semantics.
   - At most one pass. No recursive handoff.
5. `Verification / delivery`
   - Run the relevant checks once and report the result.

## Guardrails

- Do not require persona fan-out by default.
- Do not require any mandatory reject cycle.
- Do not turn internal checks into user-facing debate logs.
- Do not mention `.agent/innovations_log.md` unless the user explicitly asks.
- Do not auto-commit or auto-publish changes as part of this workflow.

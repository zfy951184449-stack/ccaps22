---
trigger: always_on
description: Minimal agent routing and context-hygiene guardrails.
---

# Agent Rules

This file is intentionally short.

- Default entry remains `AGENTS.md`.
- Do not expand `.agent/` unless the task needs a specific workflow or skill.
- Do not read `.agents/`; it is deprecated and must not carry active rules.
- Prefer one execution path with at most one optional review checkpoint.
- Prefer durable repo docs in `docs/` over long prompt templates.

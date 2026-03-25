# Docs Index

This directory is the repository-local system of record for durable context that both humans and agents can re-read.

Use it for facts that must survive beyond a single chat or PR:

- architecture and operating rules
- database semantics and field-level pitfalls
- scheduling principles and domain decisions
- generated references and schema snapshots
- execution plans, progress logs, and technical debt tracking

## Read By Topic

- Agent and rule navigation:
  - `../AGENTS.md`
  - `../.agent/rules/README.md`
- Database and API semantics:
  - `LLM_DB_GUIDELINES.md`
  - `database_api_dictionary.md`
  - `database_schema_report_cn.md`
- Scheduling and roster semantics:
  - `scheduling_principles.md`
- Generated and reference material:
  - `all_documents.md`
  - `database_api_dictionary.html`
- Multi-step work and follow-up tracking:
  - `exec-plans/README.md`
  - `exec-plans/tech-debt-tracker.md`

## Documentation Rules

- Keep documents task-addressable and linkable.
- Prefer several small files with explicit scope over one large handbook.
- Update docs in the same change when code behavior or business semantics change.
- Put durable knowledge here instead of relying on chat history, Slack, or oral memory.
- If guidance becomes checkable, prefer moving it into scripts, tests, or lint rules.

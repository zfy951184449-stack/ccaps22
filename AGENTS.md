# MFG8APS Agent Entry

Default read set:

1. `AGENTS.md`
2. `.agent/index.md`
3. `docs/ARCHITECTURE.md`
4. `docs/README.md`

Rules for context hygiene:

- Treat `.agent/` as the only active agent-doc source of truth.
- Do not scan `.agent/` recursively by default.
- Do not load `.agents/`; it is deprecated compatibility only.
- Load `.agent/workflows/multi-persona-task.md` only when the task needs extra review structure.
- Load a specific skill under `.agent/skills/` only when the task clearly matches that domain.

Runtime entrypoints:

- Legacy frontend: `frontend/src/App.tsx`
- Next frontend: `frontend-next/src/app/layout.tsx`
- Backend API: `backend/src/server.ts`
- Solver V4: `solver_v4/app.py`

If a task touches data semantics or scheduling behavior, prefer the durable docs under `docs/` over old prompt bundles.

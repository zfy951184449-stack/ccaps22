# Tech Debt Tracker

Track recurring cleanup items that should survive beyond a single PR or chat thread.

## Open

- `resource_nodes` missing-table fallback. Impacted area: backend resource-model APIs. Why it matters: `resourcesController` and template/batch resource rule endpoints already degrade gracefully when optional tables are absent, but the resource node CRUD chain still assumes `resource_nodes` exists. Reference: `backend/src/controllers/resourceNodeController.ts`, `backend/src/services/resourceNodeService.ts`.
- `SystemSettingsService` unused import. Impacted area: backend bootstrap hygiene. Why it matters: `backend/src/server.ts` still imports `SystemSettingsService` without using it, which keeps dead naming/context around and can hide future bootstrap drift. Reference: `backend/src/server.ts`.

## Closed

- Move resolved items here with the closing PR or commit reference.

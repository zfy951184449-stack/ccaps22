# Tech Debt Tracker

Track recurring cleanup items that should survive beyond a single PR or chat thread.

## Open

- No open cleanup items right now.

## Closed

- `resource_nodes` missing-table fallback. Closed in working tree cleanup after `ca6de14`. Result: read endpoints now degrade gracefully, mutation endpoints fail with explicit unavailable-model errors, and frontend resource-node collection parsing accepts warning-wrapped payloads. Reference: `backend/src/controllers/resourceNodeController.ts`, `frontend/src/services/processTemplateV2Api.ts`, `backend/src/tests/templateResourceRoutes.test.ts`.
- `SystemSettingsService` unused import. Closed in working tree cleanup after `ca6de14`. Result: removed dead bootstrap import from `backend/src/server.ts`.

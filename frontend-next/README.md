# frontend-next

`frontend-next/` is the independent Next.js workspace for the Precision Lab migration. It coexists with the legacy CRA app in `../frontend/` and does not replace the default runtime or build path during migration.

## Principles

- Keep all public UI, routing, and design-system logic local to `frontend-next/`.
- Preserve backend `/api` contracts and legacy URLs while migration is in progress.
- Treat the design system as first-party infrastructure, not as a thin skin over a third-party visual component library.
- Optimize for desktop APS workbench density on 1080p and 2K displays.

## Scripts

```bash
npm run dev
npm run lint
npm run typecheck
npm run test:ci
npm run build
npm run storybook
npm run storybook:build
npm run e2e
```

Development defaults to `http://localhost:3002`. Client requests use `NEXT_PUBLIC_API_BASE_URL`, which defaults to `/api`. In development, `/api/*` is proxied to `http://127.0.0.1:3001/api/*` unless `APS_BACKEND_ORIGIN` overrides the target.

## Structure

- `src/app/`: App Router entrypoints, route groups, root layout, error/loading surfaces.
- `src/design-system/`: Precision Lab tokens, primitives, and APS workbench patterns.
- `src/features/`: Route-aware feature shells and migration placeholders.
- `src/services/`: API client and typed service contracts.
- `src/lib/`: framework-agnostic utilities.
- `src/test/`: shared test setup and helpers.
- `.storybook/`: Storybook configuration for design-system review.
- `tests/e2e/`: Playwright smoke coverage for the independent shell.

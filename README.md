# TichuML

Milestone 0 foundation scaffold for the TichuML monorepo.

## Workspace layout

- `apps/web` - React/Vite frontend shell
- `apps/server` - Node service scaffold
- `apps/sim-runner` - simulation runner scaffold
- `packages/shared` - shared types and project metadata
- `packages/engine` - deterministic engine placeholder
- `packages/ai-heuristics` - heuristic policy placeholder
- `packages/telemetry` - telemetry schema placeholder
- `packages/ui-kit` - reusable UI shell components
- `infra/db` - SQL migrations and migration runner
- `infra/docker` - local Postgres compose stack
- `tests` - integration, replay, and e2e placeholders

## Commands

- `npm install`
- `npm run lint`
- `npm run test`
- `npm run build`
- `npm run db:up`
- `npm run db:migrate`

If local port `5432` is already in use, override it for the session before booting Postgres:

```powershell
$env:POSTGRES_PORT='5433'
npm run db:up
$env:DATABASE_URL='postgres://postgres:postgres@localhost:5433/tichuml'
npm run db:migrate
```

## Milestone 0 scope

This scaffold intentionally stops at the foundation stage so later milestones can layer deterministic engine behavior, headless play, telemetry, UI, and replay in the required order.

# TichuML

TichuML is a deterministic Tichu platform monorepo with:

- an authoritative TypeScript rules engine
- headless AI round execution and telemetry capture
- a responsive React table UI with table-editor tooling
- server-side entropy collection for seed generation
- replay, debugging, and simulation foundations

The repository no longer reflects a Milestone 0-only scaffold. Historical milestone labels still exist in a few runtime constants and tests for compatibility, but the working project has advanced well beyond the bootstrap stage.

## Current Workspace

- `apps/web` - live game client, responsive table UI, table editor, dialogs, and local app state
- `apps/server` - HTTP server, entropy collection endpoint, and server-side seed generation
- `apps/sim-runner` - deterministic headless round execution for batch and integration flows
- `packages/engine` - authoritative rules engine, deterministic shuffle, trick resolution, scoring
- `packages/ai-heuristics` - heuristic AI decision policy and explanation output
- `packages/telemetry` - append-only decision/event telemetry helpers
- `packages/shared` - shared metadata, seed provenance types, and cross-package helpers
- `packages/ui-kit` - reusable UI primitives
- `infra/db` - migrations and migration runner
- `infra/docker` - local Postgres compose stack
- `docs` - architecture, milestone history, telemetry, product, UI, and workflow notes
- `tests` - integration and replay-oriented validation

## Commands

- `npm install`
- `npm run lint`
- `npm run test`
- `npm run build`
- `npm run dev:web`
- `npm run dev:server`
- `npm run db:up`
- `npm run db:migrate`

If local port `5432` is already in use, override it for the session before booting Postgres:

```powershell
$env:POSTGRES_PORT='5433'
npm run db:up
$env:DATABASE_URL='postgres://postgres:postgres@localhost:5433/tichuml'
npm run db:migrate
```

## Documentation Map

- [SPEC](./spec.md) - long-form project specification and milestone plan
- [Docs Index](./docs/README.md) - quick navigation across architecture, UI, telemetry, and workflow notes
- [Milestones](./docs/milestones/README.md) - normalized milestone history and commit-subject guidance
- [Architecture Notes](./docs/architecture/README.md)
- [Product Notes](./docs/product/README.md)
- [UI Notes](./docs/ui/README.md)
- [Telemetry Notes](./docs/telemetry/README.md)
- [Prompt and Workflow Notes](./docs/prompts/README.md)

## Milestone Snapshot

The current repository head is Milestone `6.0`. The canonical milestone plan still lives in [SPEC](./spec.md), while the normalized repository history and recommended commit naming convention now live in [docs/milestones/README.md](./docs/milestones/README.md).

When making new milestone commits, prefer:

```text
Milestone <id>: <short scope summary>
```

Example:

```text
Milestone 6.0: developer inspection and gameplay hardening
```

Use the commit body for:

- why the milestone was needed
- key engine/UI/server changes
- tests and validation

Milestone 6.0 currently covers:

- server-backed multi-source entropy collection and deterministic shuffle seed derivation
- Random Sources inspection UI and related debug surfaces
- exchange / pickup / cumulative-score / score-history flow hardening
- Mahjong wish enforcement and no-stall engine safeguards

The git milestone history has been normalized to the shared `Milestone <id>: <scope>` format, and the current milestone map lives in [docs/milestones/README.md](./docs/milestones/README.md).

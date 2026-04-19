# TichuML

TichuML is a deterministic Tichu platform monorepo with:

- an authoritative TypeScript rules engine
- headless AI round execution and telemetry capture
- a responsive React table UI with table-editor tooling
- a local backend for entropy, telemetry ingest, decision routing, and replay reads
- replay, debugging, and simulation foundations

The repository no longer reflects a Milestone 0-only scaffold. Historical milestone labels still exist in a few runtime constants and tests for compatibility, but the working project has advanced well beyond the bootstrap stage.

## Current Workspace

- `apps/web` - live game client, responsive table UI, table editor, dialogs, and local app state
- `apps/server` - HTTP JSON API for health, entropy, telemetry, replay reads, and server-side heuristic routing
- `apps/sim-runner` - deterministic headless round execution for batch and integration flows
- `packages/engine` - authoritative rules engine, deterministic shuffle, trick resolution, scoring
- `packages/ai-heuristics` - heuristic AI decision policy and explanation output
- `packages/telemetry` - append-only decision/event telemetry helpers
- `packages/shared` - shared metadata, seed provenance types, and cross-package helpers
- `packages/ui-kit` - reusable UI primitives
- `infra/db` - migrations and migration runner
- `docker-compose.yml` - local Postgres compose stack
- `ml` - LightGBM feature building, export, training, and inference scripts
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
- `npm run bootstrap:windows`
- `npm run bootstrap:unix`

## Backend Foundation

GitHub issue [#30](https://github.com/NeonButrfly/tichuml/issues/30) tracks the backend foundation work. It intentionally sits outside the active gameplay/UI stabilization milestone stream because it is a cross-cutting backend/platform foundation rather than another table-layout bugfix.

### One-command local backend startup

Windows PowerShell:

```powershell
npm run bootstrap:windows
```

Windows watch mode:

```powershell
npm run bootstrap:windows -- -Dev
```

macOS / Linux:

```sh
npm run bootstrap:unix
```

macOS / Linux watch mode:

```sh
npm run bootstrap:unix -- --dev
```

Those scripts:

- create `.env` from `.env.example` when missing
- install workspace dependencies
- create `.venv` when missing and install `ml/requirements.txt`
- start Postgres through Docker Compose
- wait for DB readiness
- run SQL migrations
- start the backend server

### Backend env defaults

The root `.env.example` now includes:

- `DATABASE_URL`
- `PG_BOOTSTRAP_URL`
- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `POSTGRES_PORT`
- `PORT`
- `BACKEND_BASE_URL`
- `AUTO_BOOTSTRAP_DATABASE`
- `AUTO_MIGRATE`
- `PYTHON_EXECUTABLE`
- `LIGHTGBM_INFER_SCRIPT`
- `LIGHTGBM_MODEL_PATH`
- `LIGHTGBM_MODEL_META_PATH`
- `VITE_DECISION_MODE`
- `VITE_BACKEND_BASE_URL`
- `VITE_SERVER_FALLBACK_ENABLED`
- `VITE_TELEMETRY_ENABLED`

`apps/server/.env.example` mirrors the server-specific defaults when you want a backend-only env reference.

### Runtime decision and telemetry settings

The web client now exposes backend runtime settings in the hamburger menu under `Backend Settings`.

That dialog lets you change, at runtime and without rebuild:

- `Decision Mode` (`local`, `server_heuristic`, or `lightgbm_model`)
- `Backend Base URL`
- `Server Fallback`
- `Telemetry Enabled`
- backend health test/status

Env values provide first-run defaults. After the first UI change, the client persists the effective values in `localStorage` and uses those persisted settings on later runs.

### LightGBM workflow

Export action rows from Postgres:

```powershell
.\.venv\Scripts\python.exe ml/export_training_rows.py
```

```sh
./.venv/bin/python ml/export_training_rows.py
```

Train the LightGBM action model:

```powershell
.\.venv\Scripts\python.exe ml/train_lightgbm.py
```

```sh
./.venv/bin/python ml/train_lightgbm.py
```

The training path writes:

- `ml/model_registry/lightgbm_action_model.txt`
- `ml/model_registry/lightgbm_action_model.meta.json`

Switch to the model at runtime from hamburger menu -> `Backend Settings` -> `Decision Mode` -> `LightGBM model`.

### Exchange telemetry

Issue [#31](https://github.com/NeonButrfly/tichuml/issues/31) keeps exchange telemetry phase-specific. The client now records:

- `pass_select` decisions for pass-card submission
- `pass_reveal` advancement decisions when exchange resolution occurs
- `exchange_complete` pickup decisions before trick play resumes

Replay reads preserve those phases instead of collapsing exchange into trick play.

### Manual verification

Health:

```powershell
Invoke-RestMethod http://localhost:4310/health
```

```sh
curl http://localhost:4310/health
```

Replay reads:

```powershell
Invoke-RestMethod http://localhost:4310/api/games/<game-id>/replay
```

Server decision request example:

```powershell
$body = @{
  game_id = "manual-test"
  hand_id = "hand-1"
  phase = "grand_tichu_window"
  actor_seat = "seat-0"
  schema_version = 2
  engine_version = "milestone-1"
  sim_version = "milestone-2"
  state_raw = @{ phase = "grand_tichu_window" }
  state_norm = @{ phase = "grand_tichu_window" }
  legal_actions = @{ "seat-0" = @(@{ type = "decline_grand_tichu"; seat = "seat-0" }) }
  requested_provider = "lightgbm_model"
  metadata = @{ decision_index = 0 }
} | ConvertTo-Json -Depth 8

Invoke-RestMethod http://localhost:4310/api/decision/request -Method Post -ContentType "application/json" -Body $body
```

Telemetry lands in Postgres `decisions` and `events` as append-only records. Replay reads combine those ordered streams for timeline reconstruction.

## Documentation Map

- [SPEC](./spec.md) - long-form project specification and milestone plan
- [Docs Index](./docs/README.md) - quick navigation across architecture, UI, telemetry, and workflow notes
- [Milestones](./docs/milestones/README.md) - normalized milestone history and commit-subject guidance
- [GitHub Issues](https://github.com/NeonButrfly/tichuml/issues) - authoritative bug and task tracker
- [GitHub Milestones](https://github.com/NeonButrfly/tichuml/milestones) - authoritative milestone and release buckets
- [Architecture Notes](./docs/architecture/README.md)
- [Product Notes](./docs/product/README.md)
- [UI Notes](./docs/ui/README.md)
- [Telemetry Notes](./docs/telemetry/README.md)
- [Prompt Capture And Workflow Notes](./docs/prompts/README.md)

## Milestone Snapshot

The current major backend/platform stream now lives in GitHub milestone [`6.5 – Local ML Integration & Reproducible Backend`](https://github.com/NeonButrfly/tichuml/milestone/24), while the open gameplay/UI stabilization stream remains [`6.4 – Gameplay & UX Stabilization`](https://github.com/NeonButrfly/tichuml/milestone/23). GitHub milestones and GitHub issues are the authoritative project tracker. The canonical milestone plan still lives in [SPEC](./spec.md), while the normalized repository history and current GitHub milestone-to-issue mapping now live in [docs/milestones/README.md](./docs/milestones/README.md).

Prompt-capture notes in [`docs/prompts`](./docs/prompts/README.md) preserve prompt intent and issue links only. They are not a parallel tracker; status stays in GitHub.

When making new milestone commits, prefer:

```text
Milestone <id>: <short scope summary>
```

Example:

```text
Milestone 6.3: stabilize canonical table layout schema
```

Use the commit body for:

- why the milestone was needed
- key engine/UI/server changes
- tests and validation

Milestone 6.3 currently targets:

- GitHub issue [#14](https://github.com/NeonButrfly/tichuml/issues/14)
- one canonical data-driven table layout schema in `apps/web/src/table-layout.ts`
- shared seat anchors for labels, call badges, turn badges, out badges, trick zones, pickup zones, and pass lanes
- per-seat trick and pickup staging driven from schema anchors instead of ad hoc component offsets
- same-team Tichu / Grand Tichu stacking prevented in both engine eligibility and deterministic bot scoring

Milestone 6.2 still targets:

- GitHub issue [#13](https://github.com/NeonButrfly/tichuml/issues/13)
- one canonical deterministic heuristics policy shared by the web client and simulator
- stronger hand-structure-aware play selection, passing, wish choice, Dragon gifting, and Tichu / Grand Tichu evaluation
- explicit exclusion of legacy ML inference tooling from the active bot path

Milestone 6.1.5 still targets:

- GitHub issue [#12](https://github.com/NeonButrfly/tichuml/issues/12)
- shared exchange render buckets so pass-selection, in-transit, and pickup cards stay in exactly one visible state
- pickup staging for all seats during the explicit Pickup step, without leaking cards into hands early
- stronger AI hand evaluation for pass selection and Tichu / Grand Tichu decisions

Milestone 6.1.4 still targets:

- GitHub issue [#11](https://github.com/NeonButrfly/tichuml/issues/11)
- seat-local trick staging instead of a shared center play pile
- visible pickup-lane staging for received exchange cards until explicit Pickup
- engine-resolved Dog lead-transfer animation
- compact `T` / `GT` seat markers and gameplay-safe center-surface cleanup

Milestone 6.1.3 currently targets:

- GitHub issue [#3](https://github.com/NeonButrfly/tichuml/issues/3)
- active response turns resolving through play/pass instead of stalling on optional Tichu handling
- editor-only center felt/shadow rendering with no gameplay glow residue

Milestone 6.1.2 still targets:

- GitHub issue [#2](https://github.com/NeonButrfly/tichuml/issues/2)
- removal of directional indicators from live trick rendering
- central current-trick point display and editor-only play-surface shadow

Milestone 6.1.1 still targets:

- GitHub issue [#1](https://github.com/NeonButrfly/tichuml/issues/1)
- shared rank-first combo normalization across engine legality, selection matching, and concrete play validation
- regression coverage across all combo-response families

Milestone 6.1 still adds:

- GitHub issue [#10](https://github.com/NeonButrfly/tichuml/issues/10)
- centralized human turn action availability derived from engine legal actions
- protection against the illegal Tichu-only progression state on an active response turn
- straight-response and wish-fallback regression coverage for play/pass legality

Milestone 6.0 still covers:

- GitHub issues [#7](https://github.com/NeonButrfly/tichuml/issues/7), [#8](https://github.com/NeonButrfly/tichuml/issues/8), and [#9](https://github.com/NeonButrfly/tichuml/issues/9)
- server-backed multi-source entropy collection and deterministic shuffle seed derivation
- Random Sources inspection UI and related debug surfaces
- exchange / pickup / cumulative-score / score-history flow hardening
- Mahjong wish enforcement and no-stall engine safeguards

The git milestone history has been normalized to the shared `Milestone <id>: <scope>` format, and the current milestone map lives in [docs/milestones/README.md](./docs/milestones/README.md).

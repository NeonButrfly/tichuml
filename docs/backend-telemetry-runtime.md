# Backend Telemetry Runtime Limits

GitHub issues [#41](https://github.com/NeonButrfly/tichuml/issues/41) and
[#50](https://github.com/NeonButrfly/tichuml/issues/50) track the simulator,
gameplay, backend persistence, and health-truth telemetry work. Issue
[#51](https://github.com/NeonButrfly/tichuml/issues/51) tracks durable match
lifecycle rows and Linux/Windows diagnostic parity.

## Current Architecture

Telemetry has two centralized layers:

- Producer path: `packages/telemetry` owns decision/event builders, source tags,
  minimal/full/adaptive selection, byte measurement, downgrade/skip behavior,
  POST timeout/retry behavior, non-fatal defaults, strict debug failures, and
  machine-readable diagnostics. Gameplay and self-play call this package through
  thin adapters only.
- Backend ingest path: `/api/telemetry/decision` and `/api/telemetry/event`
  validate payloads synchronously with the shared backend contract, then enqueue
  persistence through a bounded server queue. The request returns after
  validation/enqueue and does not wait for Postgres writes.

Source tags are carried in telemetry metadata:

- `gameplay` for normal web/UI game decisions and events
- `selfplay` for simulator batches
- `controller` for controller-owned self-play workers
- `eval` for evaluation producers

The backend queue batches persistence, limits concurrent persistence batches, and
records structured diagnostics for:

- `telemetry_ingest_dropped_queue_pressure`
- `telemetry_persistence_failed`
- `telemetry_payload_downgraded`
- `telemetry_payload_skipped`
- `telemetry_transport_failed`
- `telemetry_backoff_suppressed`
- `telemetry_backend_rejected`

`GET /api/telemetry/health` returns database telemetry stats plus current ingest
queue stats. Queue acceptance is not database truth. The source of truth for ML
rows is the actual `decisions`, `events`, and `matches` table counts reported as
`db_decisions_count`, `db_events_count`, and `db_matches_count`.

## DB Truth Model

Queue counters describe the backend ingest worker, not training data:

- `queue_accepted`: payloads accepted by HTTP validation and put on the server
  ingest queue.
- `queue_pending` / `queue_in_flight`: work not yet committed to Postgres.
- `queue_persisted`: payload inserts that returned after the repository write
  completed.
- `persistence_failures`: repository/Postgres write failures.

Database row counts are the ML source of truth:

- `matches`: one durable lifecycle row per simulator game, keyed by `game_id`
  and joined by `match_id`.
- `decisions`: decision telemetry rows; each row has `game_id`, `hand_id`, and
  `match_id`.
- `events`: event telemetry rows, including simulator lifecycle events such as
  `game_started`, `hand_started`, `exchange_completed`, `trick_resolved`,
  `match_completed`, and `game_completed` when the simulator emits them.

`npm run telemetry:truth -- --backend-url http://127.0.0.1:4310 --require-rows`
queries Postgres directly and fails if decisions, events, or matches are empty,
or if any decision/event row cannot join back to its match row by `match_id` and
`game_id`.

`npm run telemetry:sanity -- --backend-url http://127.0.0.1:4310` performs the
training-signal check used by issue
[#54](https://github.com/NeonButrfly/tichuml/issues/54). It reports human and
JSON summaries for match/decision/event counts, provider alias mismatches, false
fallback suspicions, active wish coverage, legal chosen actions,
`select_pass` semantic validity, candidate-score coverage, event ordering
problems, JSON parse errors, and the training-readiness verdict. Use
`--database-url "$DATABASE_URL"` for direct DB checks and `--json-output <path>`
when preserving machine-readable evidence.

`GET /health` and `GET /api/telemetry/health` include runtime identity so stale
backend processes are visible:

- backend process PID
- command line
- current working directory
- sanitized `DATABASE_URL`
- git commit
- build timestamp, when available
- backend mode (`dev`, `dist`, or `server`)
- backend port
- telemetry health shape version

## Defaults

- `TELEMETRY_MODE=minimal`
  - Routine controller runs send compact decision/event telemetry.
  - Decision telemetry uses `state_raw: {}`, `state_norm: null`, and a
    legal-action list containing the chosen actor-scoped action required by the
    validator.
- `TELEMETRY_MODE=full`
  - Training, evaluation, and debugging runs may send richer `state_raw`,
    `state_norm`, explanation, candidate score, and feature fields.
- `TELEMETRY_MAX_POST_BYTES=25165824`
  - Simulator-side telemetry POST cap, currently 24 MiB.
  - Full payloads above this cap downgrade to minimal when possible; payloads
    that still exceed the cap are skipped locally and logged as structured
    oversize diagnostics.
- `TELEMETRY_POST_TIMEOUT_MS=10000`
  - Shared telemetry client timeout before best-effort transport failure
    handling.
- `TELEMETRY_RETRY_ATTEMPTS=2`
  - Network retry attempts after the first telemetry POST attempt.
- `TELEMETRY_RETRY_DELAY_MS=250`
  - Initial delay between telemetry transport retry attempts.
- `TELEMETRY_BACKOFF_MS=15000`
  - Initial endpoint backoff after telemetry transport failure. While a
    telemetry endpoint is in backoff, the shared client suppresses new POSTs to
    that endpoint, returns a structured `backoff_suppressed` result, and keeps
    gameplay/controller progress non-fatal.
- `TELEMETRY_INGEST_QUEUE_MAX_DEPTH=5000`
  - Backend queue depth before accepted telemetry is dropped for queue pressure.
- `TELEMETRY_PERSISTENCE_BATCH_SIZE=100`
  - Maximum persistence operations scheduled per backend queue batch.
- `TELEMETRY_PERSISTENCE_CONCURRENCY=2`
  - Concurrent backend telemetry persistence batches.
- `REQUEST_BODY_LIMIT=25mb`
  - Backend JSON request body limit. This takes precedence over
    `MAX_REQUEST_BODY_MB`.
- `MAX_REQUEST_BODY_MB=25`
  - Fallback backend JSON request body limit in MiB when `REQUEST_BODY_LIMIT` is
    not set.

## Failure Policy

Telemetry is best-effort when `strict_telemetry=false`. A rejected, oversized,
timed out, unreachable, queue-pressure-dropped, or persistence-failed telemetry
write increments counters and emits machine-readable diagnostics, but it must not
block a UI move, simulator game, batch completion, controller accounting, pause,
stop, or shutdown. Set `strict_telemetry=true` only when intentionally debugging
telemetry itself.

Issue [#49](https://github.com/NeonButrfly/tichuml/issues/49) tightens the
simulator-side transport behavior further:

- live sim/controller telemetry uses an async queue-backed sender only
- remote POST timeout is enforced by `TELEMETRY_POST_TIMEOUT_MS`
- timed-out requests classify as `timeout`
- fetch/connect failures classify as `network_failure`
- HTTP `5xx` responses classify as `backend_error`
- HTTP `4xx` responses remain `backend_rejection`
- strict telemetry fails a run only if both remote POST and durable local NDJSON
  fallback fail
- non-strict telemetry never fails the sim because the backend is slow or down

Simulator/controller status includes telemetry failure totals, failure counts by
endpoint, failure counts by kind, and the current telemetry backoff deadline when
one is active. This keeps repeated `network_failure` or `fetch failed` symptoms
visible without spamming the same unreachable endpoint every decision.

Backend persistence failures must never report an empty
`last_failure_message`. The backend queue preserves the Error name, message,
stack, Postgres code/detail/hint/constraint/table/column/schema fields, request
kind, game/hand/phase, accepted timestamp, payload shape summary, and insert
table context. If the thrown value is a string or object, the serializer records
a JSON or `util.inspect` preview instead of a blank message.

## End-to-End Verification

Use the doctor for a bounded layer-by-layer check:

```powershell
npm run sim:doctor -- --backend-url http://127.0.0.1:4310
```

It verifies backend health, telemetry health, direct decision/event POSTs, DB
persistence, match lifecycle persistence, one bounded simulator game, queue
flush, and simulator process exit. The output is machine-readable JSON and
failures are named by layer:
`backend_health`, `db_connection`, `telemetry_decision_post`,
`telemetry_event_post`, `persistence_decision`, `persistence_event`,
`persistence_match`, `flush`, or `orphan_process`.

On Windows, use the diagnostic ZIP script for operator evidence:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\verify-sim-one-game-fixed.ps1 -ClearDatabase
```

If PowerShell blocks downloaded repo scripts, unblock them first:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\unblock-scripts.ps1
```

The script kills stale simulator/controller processes, clears
`.runtime\sim-controller`, captures `/health`, captures telemetry health before
and after, runs exactly one strict telemetry simulator game, records table
counts, latest rows, and join truth, captures backend process command lines and
sanitized DB identity from health, zips all outputs, and fails if
`decisions = 0`, `events = 0`, `matches = 0`, join validation fails, queue
pending remains non-zero, persistence failures are present, or a simulator
process remains.

The legacy path remains as a compatibility alias:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\verify-sim-one-game-fixed.ps1 -ClearDatabase
```

On Linux, use the equivalent bounded diagnostic from any working directory:

```bash
/opt/tichuml/scripts/linux/verify-sim-one-game-fixed.sh --clear-database --timeout-seconds 90 --backend-url http://127.0.0.1:4310
```

The Linux script writes artifacts under `diagnostics/verify-one-game-linux-*`
and creates a `.tar.gz` archive at the repo root.

Manual DB monitor commands:

```powershell
docker exec tichu-postgres psql -U tichu -d tichu -c "SELECT COUNT(*) FROM decisions;"
docker exec tichu-postgres psql -U tichu -d tichu -c "SELECT COUNT(*) FROM events;"
docker exec tichu-postgres psql -U tichu -d tichu -c "SELECT COUNT(*) FROM matches;"
```

If health shows `telemetry_persistence_failed`, compare
`last_failure_message`, `last_failure_detail`, the sanitized runtime
`DATABASE_URL`, and the table counts above. A queue accepted/persisted counter
alone is not enough evidence that rows are available for training.

The simulator/controller runtime state now also includes:

- overall telemetry status: `connected`, `degraded`, `backoff`, `offline`
- queue depth
- accepted / failed / dropped / pending counts
- last success and last failure timestamps
- last failure reason
- per-endpoint `next_retry_at`
- local spool directories for pending and replayed NDJSON

## Local Spool And Replay

Pending simulator-side telemetry is written under:

- `.runtime/telemetry/pending/`

Successfully replayed files are moved to:

- `.runtime/telemetry/replayed/`

Replay commands:

- `npm run telemetry:replay`
- `npx tsx apps/sim-runner/src/telemetry/replay.ts`

Use replay after backend outages, long operator-network interruptions, or after
controller stop drained only part of the queue.

Replay and training readers must order persisted events by `game_id`,
`hand_id`, `event_index`, and `ts` with `id` as a final tiebreaker. Raw CSV row
order is not a contract.

Deterministic export examples:

```bash
psql "$DATABASE_URL" -c "\copy (SELECT * FROM matches ORDER BY game_id ASC, COALESCE(completed_at, updated_at, started_at, created_at) ASC, id ASC) TO 'matches.csv' WITH CSV HEADER"
psql "$DATABASE_URL" -c "\copy (SELECT * FROM decisions ORDER BY game_id ASC, hand_id ASC, decision_index ASC, ts ASC, id ASC) TO 'decisions.csv' WITH CSV HEADER"
psql "$DATABASE_URL" -c "\copy (SELECT * FROM events ORDER BY game_id ASC, hand_id ASC, event_index ASC, ts ASC, id ASC) TO 'events.csv' WITH CSV HEADER"
```

## Backend URL Selection

Normal browser gameplay uses the browser/runtime backend setting. The simulator
controller runs on the backend host, so its default `SIM_BACKEND_URL` is
local-first: explicit `SIM_BACKEND_URL`, then `BACKEND_URL`, then
`BACKEND_LOCAL_URL`, then `http://127.0.0.1:<PORT>`. This avoids silently posting
controller telemetry to an operator/public host address when the local backend
listener is reachable only through loopback from the controller process.

The public/operator URL remains `BACKEND_BASE_URL` / `BACKEND_PUBLIC_URL`.
Set `SIM_BACKEND_URL` explicitly only when the simulator process must post to a
different reachable backend. The simulator dashboard chooses the browser origin
as the initial remote default when served from the backend host, but it does not
silently rewrite an already configured Backend URL after a transport failure.
Runtime/admin status, controller launch args, sim-runner CLI config, and the
shared telemetry client should therefore show the same effective endpoint.

## Script Parity

Canonical local environment shared by Windows and Linux:

| Setting            | Value                                                          |
| ------------------ | -------------------------------------------------------------- |
| Postgres container | `tichu-postgres`                                               |
| Postgres user/db   | `tichu` / `tichu`                                              |
| Postgres host port | `54329`                                                        |
| `DATABASE_URL`     | `postgres://tichu:tichu_dev_password@localhost:54329/tichu`    |
| `PG_BOOTSTRAP_URL` | `postgres://tichu:tichu_dev_password@localhost:54329/postgres` |
| Backend URL        | `http://127.0.0.1:4310`                                        |
| Linux repo path    | `/opt/tichuml`                                                 |

| Task                  | Windows                                                                                                                                                                                    | Linux                                                                                                                                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Start backend         | `powershell -ExecutionPolicy Bypass -File scripts\windows\start-backend.ps1`                                                                                                               | `./scripts/linux/start-backend.sh`                                                                                                                                                                 |
| Stop backend          | `powershell -ExecutionPolicy Bypass -File scripts\windows\stop-backend.ps1`                                                                                                                | `./scripts/linux/stop-backend.sh`                                                                                                                                                                  |
| Restart backend       | `powershell -ExecutionPolicy Bypass -File scripts\windows\restart-backend.ps1`                                                                                                             | `./scripts/linux/restart-backend.sh`                                                                                                                                                               |
| Check status          | `powershell -ExecutionPolicy Bypass -File scripts\windows\status-backend.ps1`                                                                                                              | `./scripts/linux/status-backend.sh`                                                                                                                                                                |
| Reset DB              | `powershell -ExecutionPolicy Bypass -File scripts\windows\reset-db.ps1`                                                                                                                    | `./scripts/linux/reset-db.sh --yes`                                                                                                                                                                |
| One-game verification | `powershell -ExecutionPolicy Bypass -File scripts\windows\verify-sim-one-game-fixed.ps1 -ClearDatabase -TimeoutSeconds 90`                                                                 | `./scripts/linux/verify-sim-one-game-fixed.sh --clear-database --timeout-seconds 90`                                                                                                               |
| Sim doctor            | `powershell -ExecutionPolicy Bypass -File scripts\windows\sim-doctor.ps1 --backend-url http://127.0.0.1:4310 --timeout-ms 30000`                                                           | `./scripts/linux/sim-doctor.sh --backend-url http://127.0.0.1:4310 --timeout-ms 30000`                                                                                                             |
| Training simulator    | `powershell -ExecutionPolicy Bypass -File scripts\windows\run-training-sim.ps1 -Provider local -Telemetry true -StrictTelemetry false -BackendUrl http://127.0.0.1:4310 -GamesPerLoop 100` | `./scripts/linux/run-training-sim.sh --provider local --telemetry true --strict-telemetry false --backend-url http://127.0.0.1:4310 --games-per-loop 100 --log-dir /opt/tichuml/logs/sim-training` |

Logs:

- Windows backend: `.runtime\backend.log`
- Windows training simulator: `logs\sim-training\*.log`
- Linux backend: `.runtime/backend.log`
- Linux training simulator: `/opt/tichuml/logs/sim-training/*.log` by default

To prove Windows and Linux are using the same backend URL, DB, and telemetry
mode, compare `/health`, `/api/telemetry/health`, and
`npm run telemetry:truth -- --backend-url http://127.0.0.1:4310 --require-rows`.
The backend health payload includes the sanitized `DATABASE_URL`, process PID,
command line, cwd, git commit, backend mode, port, and telemetry health shape
version.

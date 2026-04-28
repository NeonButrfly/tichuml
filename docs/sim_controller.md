# Simulator Controller

Tracking issues:

- [#37](https://github.com/NeonButrfly/tichuml/issues/37)
- [#44](https://github.com/NeonButrfly/tichuml/issues/44)

The simulator controller is an admin/operator control plane for background
self-play on the Linux backend. Existing one-shot `npm run sim` behavior remains
available.

## Admin API

All endpoints require `ENABLE_ADMIN_SIM_CONTROL=true`.

Mutating endpoints also require:

```text
x-admin-confirm: CLEAR_TICHU_DB
```

Endpoints:

- `POST /api/admin/sim/start`
- `POST /api/admin/sim/pause`
- `POST /api/admin/sim/continue`
- `POST /api/admin/sim/stop`
- `GET /api/admin/sim/status`
- `POST /api/admin/sim/run-once`

Responses use:

- `accepted`
- `action`
- `prior_status`
- `current_status`
- `message`
- `runtime_state`
- `warnings`

## Runtime State

The controller stores state under `SIM_CONTROLLER_RUNTIME_DIR`, defaulting to
`.runtime/sim-controller`.

Files:

- `state.json`: runtime state, worker summaries, heartbeat, counters, paths
- `controller.lock`: singleton lock
- `pause`: pause request file
- `stop`: stop request file
- `controller.ndjson`: structured JSONL log

Runtime state now uses schema version `2` and separates live controller state
from historical summaries:

- live: `status`, `pid`, `controller_session_id`, `current_batch_started_at`,
  `workers`, `last_heartbeat`, `active_run_seed`
- historical: `last_batch_*`, `last_error`, `last_shutdown_reason`,
  `last_exit_code`, `last_exit_signal`, `last_run_seed`

On service startup, the backend reconciles stale runtime state before serving
status or starting a new controller session. If the persisted controller PID or
session is dead, the service immediately rewrites `state.json` to a non-running
state, clears live workers and heartbeats, clears the active batch, moves any
live run seed to `last_run_seed`, and marks the historical batch as
`interrupted` instead of leaving the runtime stuck on `running`.

Workers shown in the dashboard must belong to the current
`controller_session_id` only.

## Pause / Continue

Pause writes the pause file and stops scheduling new batches. Workers complete
the current safe batch boundary, then report `paused`. Continue removes the
pause file and preserves counters.

## Stop

Stop is idempotent. It writes the stop marker, terminates the tracked controller
process path when the backend owns it, removes stale control files/locks, and
rewrites runtime state to `stopped` with no worker rows. Completed totals remain
in the aggregate counters, but stopped/completed workers are not kept as stale
table rows in the dashboard.

If the controller exits because of `SIGTERM` / exit code `143`, that is stored
historically as a terminated/interrupted shutdown. It is not left behind as a
live `running` session.

## Run Seed Semantics

Issue [#44](https://github.com/NeonButrfly/tichuml/issues/44) also clarifies
the simulator seed flow:

- each controller run resolves exactly one `active_run_seed`
- automatic mode uses the existing multi-source entropy pipeline once at run
  start
- manual mode only applies when `manual_seed_override_enabled=true`
- batch seeds are deterministic child seeds derived from the resolved run seed
  plus the derivation namespace, worker id, and batch index
- the dashboard shows `Current run seed` read-only while a run is active
- historical seed information moves to `last_run_seed` after stop/restart

`seed_prefix` remains as a compatibility field in shared config/runtime data,
but the authoritative operator meaning is `seed_namespace`: an internal
derivation namespace, not the primary run seed.

## Worker Count

`worker_count` controls concurrent simulator worker tasks inside one controller.
With `worker_count = 1`, the lock enforces strict singleton controller
execution. With multiple workers, one controller owns all workers and assigns
stable IDs such as `worker-01`.

Worker IDs are included in decision/event telemetry metadata as `worker_id` and
are extracted into database `worker_id` columns for querying.

Default controller values come from the runtime config/env layer:

- `SIM_PROVIDER`
- `SIM_BACKEND_URL`
- `SIM_WORKER_COUNT`
- `SIM_GAMES_PER_BATCH`
- `TELEMETRY_MODE`
- `TELEMETRY_MAX_POST_BYTES`
- `TELEMETRY_POST_TIMEOUT_MS`
- `TELEMETRY_RETRY_ATTEMPTS`
- `TELEMETRY_RETRY_DELAY_MS`
- `TELEMETRY_BACKOFF_MS`

`SIM_BACKEND_URL` is the effective backend URL passed to the sim-runner process
and into the shared telemetry client. If it is not set, the backend config uses
the local backend URL (`BACKEND_LOCAL_URL` or `http://127.0.0.1:<PORT>`) so a
controller running on the backend host does not depend on reaching the host's
public/operator address.

Runtime state exposes telemetry transport health:

- `telemetry_decision_failures`
- `telemetry_event_failures`
- `telemetry_failures_total`
- `telemetry_failure_by_endpoint`
- `telemetry_failure_by_kind`
- `telemetry_backoff_until`

These counters are diagnostic only. With `strict_telemetry=false`, telemetry
transport failures and backoff suppression must not block batches, game counts,
pause/stop behavior, or worker shutdown.

Dashboard status refreshes adopt the effective runtime controller config unless
the operator has unsaved edits in the form.

## CLI Script

```bash
scripts/linux/sim-controller.sh status
scripts/linux/sim-controller.sh start --provider local --games-per-batch 10 --worker-count 2
scripts/linux/sim-controller.sh pause
scripts/linux/sim-controller.sh continue
scripts/linux/sim-controller.sh stop
scripts/linux/sim-controller.sh run-once --games 1
```

Environment:

- `API_URL`, default `http://localhost:4310`
- `CONFIRM_TOKEN`, default `CLEAR_TICHU_DB`

With no arguments, the script prompts interactively.

# Simulator Controller

Tracking issue: [#37](https://github.com/NeonButrfly/tichuml/issues/37)

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

The controller recovers stale locks when the last heartbeat is older than the
configured stale threshold.

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

Dashboard status refreshes adopt the effective runtime controller config unless
the operator has unsaved edits in the form.

## CLI Script

```bash
scripts/sim-controller.sh status
scripts/sim-controller.sh start --provider local --games-per-batch 10 --worker-count 2
scripts/sim-controller.sh pause
scripts/sim-controller.sh continue
scripts/sim-controller.sh stop
scripts/sim-controller.sh run-once --games 1
```

Environment:

- `API_URL`, default `http://localhost:4310`
- `CONFIRM_TOKEN`, default `CLEAR_TICHU_DB`

With no arguments, the script prompts interactively.

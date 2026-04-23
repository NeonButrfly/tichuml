# Backend Telemetry Runtime Limits

GitHub issue [#41](https://github.com/NeonButrfly/tichuml/issues/41) tracks the
simulator/backend telemetry resilience work.

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
- `telemetry_backend_rejected`

`GET /api/telemetry/health` returns database telemetry stats plus current ingest
queue stats.

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

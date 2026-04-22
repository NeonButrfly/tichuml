# Backend Telemetry Runtime Limits

GitHub issue [#41](https://github.com/NeonButrfly/tichuml/issues/41) tracks the
simulator/backend telemetry resilience work.

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
  - Payloads above this cap are skipped locally and logged as structured
    telemetry persistence failures.
- `REQUEST_BODY_LIMIT=25mb`
  - Backend JSON request body limit. This takes precedence over
    `MAX_REQUEST_BODY_MB`.
- `MAX_REQUEST_BODY_MB=25`
  - Fallback backend JSON request body limit in MiB when `REQUEST_BODY_LIMIT` is
    not set.

## Failure Policy

Telemetry persistence is best-effort when `strict_telemetry=false`. A rejected,
oversized, or unreachable telemetry endpoint increments telemetry failure
counters and emits machine-readable logs, but it must not block game or batch
completion. Set `strict_telemetry=true` only when debugging backend telemetry
persistence itself.

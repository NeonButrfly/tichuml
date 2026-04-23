# Simulator Diagnostics Harness

Issue: [#45](https://github.com/NeonButrfly/tichuml/issues/45)

The simulator diagnostics harness runs controlled simulator permutations through the real `npm run sim` entrypoint, captures live structured behavior, and writes machine-readable artifacts under `diagnostics/sim-runs/<timestamp>/`.

## What It Covers

- provider permutations for `server_heuristic` and `local`
- telemetry on/off and `minimal` / `full`
- explicit `server_fallback` behavior
- low/high worker-count controller runs when requested
- live parsing of simulator stderr/stdout, controller runtime snapshots, and controller NDJSON logs
- machine-readable summaries, comparison output, and a Markdown report

The harness does not replace simulator, controller, telemetry, or backend code paths. It exercises the current stack and records how it behaves.

## Entry Point

```bash
npm run sim:diag -- --mode quick
```

The script lives at:

`scripts/sim-diagnostics.ts`

## Usage

Quick run:

```bash
npm run sim:diag -- --mode quick
```

Full matrix:

```bash
npm run sim:diag -- --mode full
```

Local-only:

```bash
npm run sim:diag -- --mode quick --provider local
```

Server vs local comparison:

```bash
npm run sim:diag -- --mode quick --provider server_heuristic --provider local
```

Single named permutation:

```bash
npm run sim:diag -- --mode single --case server-heuristic-telemetry-on
```

Manual seed override:

```bash
npm run sim:diag -- --mode quick --manual-seed smoke-seed
```

## Focus Modes

- `single`: first matching named case only
- `quick`: smaller, bounded repro runs with a diagnostics wall-clock timeout
- `full`: larger matrix with controller worker-count coverage
- `--verbose`: print command lines while the harness runs
- `--quiet`: suppress console progress output

## Output Layout

```text
diagnostics/sim-runs/<timestamp>/
  index.json
  comparison.json
  REPORT.md
  <run-id>/
    summary.json
    stdout.log
    stderr.log
    events.ndjson
```

## summary.json

Each run summary records:

- wall-clock start/end and duration
- exact command line used
- resolved config
- provider and telemetry settings
- seed mode and resolved run seed
- backend preflight result
- total games completed and decisions recorded
- fallback counts/rates
- telemetry attempts, successes, failures, backoff suppression, downgrade/skip counters
- repeated log signatures
- throughput metrics
- runtime anomalies and final controller state for controller runs
- flags that mark the run clean or degraded

## events.ndjson

The harness parses live output into classified events, including:

- `decision_request_contract_failure`
- `payload_validation`
- `decision_fallback`
- `telemetry_failure`
- `telemetry_backoff_suppressed`
- `activeSeat=null`
- `diagnostic_timing`
- controller `runtime_snapshot`
- controller `batch_start` / `batch_end`
- process timeout / forced termination markers

## comparison.json

The comparison file rolls up each run into:

- duration
- games/sec
- decisions/sec
- fallback rate
- telemetry failure rate
- repeated-log volume
- clean vs degraded state

It also emits explicit local vs `server_heuristic` comparisons when the profile matches.

## Diagnostics-Only Timing

When the harness runs, it enables `SIM_DIAGNOSTICS=1`. That unlocks structured timing events without changing default simulator behavior.

Current timing stages include:

- `contract_validation`
- `decision_request_payload_build`
- `server_request_roundtrip`
- `local_decision_policy`
- `fallback_local_resolution`
- `telemetry_select_payload`
- `telemetry_validate_payload`
- `telemetry_post`
- `telemetry_emit_total`
- `telemetry_emit_decision`
- `telemetry_emit_event`

## Seed Handling

The harness keeps the simulator seed model explicit:

- default mode uses the project entropy pipeline to resolve one run seed per diagnostics run
- `--manual-seed` switches the run into explicit manual override mode
- the resolved run seed and entropy metadata are stored in the run summary

## Notes

- Quick mode is intentionally wall-clock bounded so hot loops, stalls, and severe slowdowns still produce artifacts instead of hanging the whole session.
- A timed-out run is considered degraded, not successful.
- The harness is for diagnosis, not for changing runtime defaults or hiding failures.

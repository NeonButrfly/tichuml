# Simulator Diagnostics Report

Session root: `C:\tichu\tichuml\diagnostics\sim-runs\2026-04-27T22-37-39-646Z`
Generated: 2026-04-27T22:39:04.670Z

## Runs

- local telemetry off: local / oneshot, duration 20.325s, games/sec 0, fallback 0%, telemetry failure 0%, chosen mismatch 0, client validation 0, transport 0, degraded
- local telemetry on: local / oneshot, duration 20.368s, games/sec 0, fallback 0%, telemetry failure 0%, chosen mismatch 0, client validation 0, transport 0, degraded
- server_heuristic fallback off: server_heuristic / oneshot, duration 3.594s, games/sec 0, fallback 0%, telemetry failure 0%, chosen mismatch 0, client validation 0, transport 0, degraded
- server_heuristic telemetry full: server_heuristic / oneshot, duration 3.526s, games/sec 0, fallback 0%, telemetry failure 0%, chosen mismatch 0, client validation 0, transport 0, degraded
- server_heuristic telemetry off: server_heuristic / oneshot, duration 2.67s, games/sec 0, fallback 0%, telemetry failure 0%, chosen mismatch 0, client validation 0, transport 0, degraded
- server_heuristic telemetry on: server_heuristic / oneshot, duration 4.382s, games/sec 0, fallback 0%, telemetry failure 0%, chosen mismatch 0, client validation 0, transport 0, degraded

## Highlights

- No cross-run highlights exceeded the configured thresholds.

## Provider Rollups

- local: 2 run(s), avg games/sec 0, avg decisions/sec 0, avg fallback 0%, avg telemetry failure 0%, degraded 2
- server_heuristic: 4 run(s), avg games/sec 0, avg decisions/sec 0, avg fallback 0%, avg telemetry failure 0%, degraded 4

## Explicit Comparisons

- oneshot|telemetry-off|minimal|fallback-on|workers-1 / games_per_sec: server_heuristic=0, local=0, delta=0
- oneshot|telemetry-off|minimal|fallback-on|workers-1 / decisions_per_sec: server_heuristic=0, local=0, delta=0
- oneshot|telemetry-off|minimal|fallback-on|workers-1 / fallback_rate: server_heuristic=0, local=0, delta=0
- oneshot|telemetry-off|minimal|fallback-on|workers-1 / telemetry_failure_rate: server_heuristic=0, local=0, delta=0
- oneshot|telemetry-on|minimal|fallback-on|workers-1 / games_per_sec: server_heuristic=0, local=0, delta=0
- oneshot|telemetry-on|minimal|fallback-on|workers-1 / decisions_per_sec: server_heuristic=0, local=0, delta=0
- oneshot|telemetry-on|minimal|fallback-on|workers-1 / fallback_rate: server_heuristic=0, local=0, delta=0
- oneshot|telemetry-on|minimal|fallback-on|workers-1 / telemetry_failure_rate: server_heuristic=0, local=0, delta=0

## Artifact Layout

```text
C:\tichu\tichuml\diagnostics\sim-runs\2026-04-27T22-37-39-646Z/
  index.json
  comparison.json
  REPORT.md
  <run-id>/
    summary.json
    stdout.log
    stderr.log
    events.ndjson
```


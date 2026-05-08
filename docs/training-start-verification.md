# Training Start Verification

Linked issue: [#61](https://github.com/NeonButrfly/tichuml/issues/61)

## What was broken

- `scripts/start-training.ps1` and `scripts/start-training.sh` could report
  success before the run proved it was alive and writing scoped telemetry rows.
- Session status and stop commands only searched the default `training-runs/`
  tree, so custom `--output-dir` / `-OutputDir` runs were not reliably
  discoverable.
- Script validation did not include an opt-in real startup smoke that proves
  DB rows are produced for the current run.

## What was fixed

- Both start-training launchers now preflight repo root, dependencies, backend
  reachability, Postgres reachability, required tables, telemetry health, and
  conflicting active writers.
- Both launchers now wait for startup verification before printing success:
  process still running, runner log started, and scoped `matches`, `events`,
  and `decisions` rows tied to the current run id / game-id prefix are present.
- Failure output now includes the attempted command, working directory, backend
  target, database target, PID state, recent log lines, recent verification
  lines, and scoped/global DB counts.
- Status and stop launchers now locate metadata repo-wide, including custom
  output directories.
- `scripts/verify-scripts.ps1` and `scripts/verify-scripts.sh` now remain the
  canonical audit command, and the smoke suite can run a real one-game startup
  check for both Windows and Linux launchers.

## Verified operator flow

Windows:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\verify-scripts.ps1
powershell -ExecutionPolicy Bypass -File scripts\start-training.ps1 -SessionName tichuml-training-smoke-win -Games 1 -Provider server_heuristic -BackendUrl http://127.0.0.1:4310 -NoClear -ReplaceSession -SkipMlExportCheck
powershell -ExecutionPolicy Bypass -File scripts\status-training.ps1 -SessionName tichuml-training-smoke-win -TailLines 20
```

Linux:

```bash
scripts/verify-scripts.sh
scripts/start-training.sh --session tichuml-training-smoke-linux --games 1 --provider server_heuristic --backend-url http://127.0.0.1:4310 --no-clear --replace-session --skip-ml-export-check
scripts/status-training.sh --session tichuml-training-smoke-linux --tail-lines 20
```

Success is real only after the launcher prints `Training job verified: ...`
with scoped row counts for the current run. If verification fails, use the
printed `status-run` command and the last log lines shown by the launcher to
debug the specific backend, DB, or telemetry fault.

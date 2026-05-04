# Script Layout

Issue [#51](https://github.com/NeonButrfly/tichuml/issues/51) tracks the
cross-platform backend and telemetry diagnostics layout.

Platform-specific scripts are canonical under:

```text
scripts/linux/
scripts/windows/
```

Flat scripts under `scripts/` are compatibility wrappers only. They exist so
older operator commands keep working, but they should not grow independent
behavior.

All human-runnable operator entrypoints now support built-in usage help:

- Linux shell scripts: `--help` or `-h`
- Windows PowerShell scripts: `-Help` or `-?`

Compatibility wrappers forward help requests to their canonical OS-specific
targets so older commands remain discoverable instead of failing silently.

## Repo Root Rules

Scripts that run `npm`, `npx`, `tsx`, `node`, workspace commands, or
repo-relative `psql` export/import paths must resolve and enter repo root
before execution. Shared helpers now live at:

- `scripts/windows/common.ps1`
- `scripts/linux/common.sh`

These helpers resolve from script location, validate `package.json`, validate
expected repo files such as `scripts/training-data.ts`, and then switch into
repo root before operator-facing command execution.

Operator-friendly entrypoints now include:

- `scripts/start-frontend.sh`
- `scripts/start-backend.sh`
- `scripts/stop-backend.sh`
- `scripts/restart-backend.sh`
- `scripts/backend-health.sh`
- `scripts/backend-logs.sh`
- `scripts/windows/start-frontend.ps1`
- `scripts/windows/start-backend.ps1`
- `scripts/windows/stop-backend.ps1`
- `scripts/windows/restart-backend.ps1`
- `scripts/windows/backend-health.ps1`
- `scripts/windows/backend-logs.ps1`
- `scripts/start-training-data.ps1`
- `scripts/stop-training-data.ps1`
- `scripts/start-training-data.sh`
- `scripts/start-sim.ps1`
- `scripts/start-sim-controller.ps1`
- `scripts/status-sim-controller.ps1`
- `scripts/stop-sim-controller.ps1`
- `scripts/run-training-sim.ps1`
- `scripts/run-training-sim.sh`
- `scripts/sim-doctor.ps1`
- `scripts/sim-doctor.sh`
- `scripts/verify-sim-one-game-fixed.sh`

## Canonical Layout

```text
scripts/
  backend-linux-common.sh
  backend-windows-common.ps1
  bootstrap.sh
  bootstrap.ps1
  force-sync.sh
  install_backend_linux.sh
  install_backend_windows.ps1
  reset_postgres_windows.ps1
  restart_backend_windows.ps1
  runtime_action_linux.sh
  run-training-sim.ps1
  run-training-sim.sh
  sim-controller.sh
  sim-doctor.ps1
  sim-doctor.sh
  start-sim.ps1
  start-sim-controller.ps1
  start-training-data.ps1
  start-training-data.sh
  start_backend_linux.sh
  start_backend_windows.ps1
  start_sim_controller_windows.ps1
  start_sim_windows.ps1
  status_backend_linux.sh
  status_backend_windows.ps1
  status-sim-controller.ps1
  status_sim_controller_windows.ps1
  stop_backend_linux.sh
  stop_backend_windows.ps1
  stop-sim-controller.ps1
  stop-training-data.ps1
  stop_sim_controller_windows.ps1
  unblock_windows_scripts.ps1
  update_backend_linux.sh
  update_backend_windows.ps1
  verify-full-sim-backend.sh
  verify-sim-one-game-fixed.sh
  verify-sim-one-game-fixed.ps1
  linux/
    backend-common.sh
    bootstrap.sh
    force-sync.sh
    install-backend.sh
    restart-backend.sh
    reset-db.sh
    run-training-sim.sh
    start-training-data-tmux.sh
    runtime-action.sh
    sim-controller.sh
    sim-doctor.sh
    start-backend.sh
    status-backend.sh
    stop-backend.sh
    tail-backend-logs.sh
    tail-sim-logs.sh
    update-backend.sh
    verify-full-sim-backend.sh
    verify-sim-one-game-fixed.sh
  windows/
    backend-common.ps1
    bootstrap.ps1
    install-backend.ps1
    reset-db.ps1
    restart-backend.ps1
    run-training-sim.ps1
    start-training-data.ps1
    sim-doctor.ps1
    start-backend.ps1
    start-sim-controller.ps1
    start-sim.ps1
    status-backend.ps1
    status-sim-controller.ps1
    stop-training-data.ps1
    stop-backend.ps1
    stop-sim-controller.ps1
    unblock-scripts.ps1
    update-backend.ps1
    verify-sim-one-game-fixed.ps1
```

## Wrapper Map

| Compatibility wrapper | Canonical target |
| --- | --- |
| `scripts/start_backend_linux.sh` | `scripts/linux/start-backend.sh` |
| `scripts/status_backend_linux.sh` | `scripts/linux/status-backend.sh` |
| `scripts/stop_backend_linux.sh` | `scripts/linux/stop-backend.sh` |
| `scripts/update_backend_linux.sh` | `scripts/linux/update-backend.sh` |
| `scripts/install_backend_linux.sh` | `scripts/linux/install-backend.sh` |
| `scripts/runtime_action_linux.sh` | `scripts/linux/runtime-action.sh` |
| `scripts/sim-controller.sh` | `scripts/linux/sim-controller.sh` |
| `scripts/verify-full-sim-backend.sh` | `scripts/linux/verify-full-sim-backend.sh` |
| `scripts/start_backend_windows.ps1` | `scripts/windows/start-backend.ps1` |
| `scripts/status_backend_windows.ps1` | `scripts/windows/status-backend.ps1` |
| `scripts/stop_backend_windows.ps1` | `scripts/windows/stop-backend.ps1` |
| `scripts/update_backend_windows.ps1` | `scripts/windows/update-backend.ps1` |
| `scripts/install_backend_windows.ps1` | `scripts/windows/install-backend.ps1` |
| `scripts/restart_backend_windows.ps1` | `scripts/windows/restart-backend.ps1` |
| `scripts/reset_postgres_windows.ps1` | `scripts/windows/reset-db.ps1` |
| `scripts/start_sim_windows.ps1` | `scripts/windows/start-sim.ps1` |
| `scripts/start_sim_controller_windows.ps1` | `scripts/windows/start-sim-controller.ps1` |
| `scripts/status_sim_controller_windows.ps1` | `scripts/windows/status-sim-controller.ps1` |
| `scripts/stop_sim_controller_windows.ps1` | `scripts/windows/stop-sim-controller.ps1` |
| `scripts/verify-sim-one-game-fixed.ps1` | `scripts/windows/verify-sim-one-game-fixed.ps1` |
| `scripts/unblock_windows_scripts.ps1` | `scripts/windows/unblock-scripts.ps1` |
| `scripts/start-training-data.ps1` | `scripts/windows/start-training-data.ps1` |
| `scripts/stop-training-data.ps1` | `scripts/windows/stop-training-data.ps1` |
| `scripts/start-sim.ps1` | `scripts/windows/start-sim.ps1` |
| `scripts/start-sim-controller.ps1` | `scripts/windows/start-sim-controller.ps1` |
| `scripts/status-sim-controller.ps1` | `scripts/windows/status-sim-controller.ps1` |
| `scripts/stop-sim-controller.ps1` | `scripts/windows/stop-sim-controller.ps1` |
| `scripts/run-training-sim.ps1` | `scripts/windows/run-training-sim.ps1` |
| `scripts/sim-doctor.ps1` | `scripts/windows/sim-doctor.ps1` |
| `scripts/start-training-data.sh` | `scripts/linux/start-training-data-tmux.sh` |
| `scripts/run-training-sim.sh` | `scripts/linux/run-training-sim.sh` |
| `scripts/sim-doctor.sh` | `scripts/linux/sim-doctor.sh` |
| `scripts/verify-sim-one-game-fixed.sh` | `scripts/linux/verify-sim-one-game-fixed.sh` |

## Safe And Destructive Scripts

Safe read-only or bounded scripts:

- `scripts/linux/status-backend.sh`
- `scripts/linux/tail-backend-logs.sh`
- `scripts/linux/tail-sim-logs.sh`
- `scripts/linux/sim-doctor.sh`
- `scripts/windows/status-backend.ps1`
- `scripts/windows/sim-doctor.ps1`
- `scripts/windows/unblock-scripts.ps1`

Destructive or force-overwrite scripts:

- `scripts/linux/install-backend.sh`
- `scripts/linux/start-backend.sh`
- `scripts/linux/update-backend.sh`
- `scripts/linux/reset-db.sh --yes`
- `scripts/windows/install-backend.ps1`
- `scripts/windows/update-backend.ps1`
- `scripts/windows/reset-db.ps1`

Backend update/start force-sync behavior is tracked by
[#55](https://github.com/NeonButrfly/tichuml/issues/55). These scripts must not
trust a stale local `origin/<branch>` ref as remote truth. They read the live
remote branch with `git ls-remote origin refs/heads/<branch>`, force-fetch the
exact refspec
`+refs/heads/<branch>:refs/remotes/origin/<branch>`, reset hard to the refreshed
remote-tracking ref, clean untracked files, and verify local `HEAD` equals the
live remote SHA before reporting success. If the live remote cannot be reached,
the update status is written as failed instead of reporting local and remote as
equal.

Scripts that require explicit confirmation or destructive flags:

- `scripts/linux/reset-db.sh --yes`
- `scripts/linux/verify-full-sim-backend.sh --clear-database`
- `scripts/linux/verify-sim-one-game-fixed.sh --clear-database`
- `scripts/windows/verify-sim-one-game-fixed.ps1 -ClearDatabase`

## Linux Operator Flow

```bash
./scripts/linux/install-backend.sh
./scripts/linux/update-backend.sh
./scripts/linux/start-backend.sh
./scripts/linux/status-backend.sh
./scripts/start-training-data.sh --help
npm run sim:doctor -- --backend-url http://127.0.0.1:4310 --timeout-ms 30000
./scripts/linux/verify-full-sim-backend.sh --repo-root /opt/tichuml --clear-database --games 100 --provider local --telemetry-mode minimal
```

Executable-bit verification:

```bash
git ls-files -s scripts | grep -E '\.sh$'
```

Every tracked `.sh` file should show mode `100755`.

## Windows Operator Flow

If PowerShell blocks repo scripts after download or archive extraction, unblock
the repo scripts first:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\unblock-scripts.ps1
```

That removes Mark-of-the-Web metadata from repo script files so operators do not
have to right-click each file and choose `Properties -> Unblock`. This metadata
comes from Windows download handling and cannot be pre-cleared in Git for every
download method.

Canonical Windows flow:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\unblock-scripts.ps1
powershell -ExecutionPolicy Bypass -File scripts\windows\install-backend.ps1
powershell -ExecutionPolicy Bypass -File scripts\windows\start-backend.ps1
powershell -ExecutionPolicy Bypass -File scripts\windows\status-backend.ps1
```

Do not lower `LocalMachine` or `CurrentUser` execution policy automatically.
Use `-ExecutionPolicy Bypass` on individual commands instead.

## Training Data Workflow

Issue [#61](https://github.com/NeonButrfly/tichuml/issues/61) tracks the
scoped Linux and Windows training-data session workflow.

Default behavior now creates a unique run-specific session or job name instead
of reusing a fixed `tichuml-training` label.

Linux examples:

```bash
chmod +x scripts/linux/start-training-data-tmux.sh
chmod +x scripts/start-training-data.sh
scripts/start-training-data.sh --help
scripts/start-training-data.sh --games 1000 --provider server_heuristic --backend-url http://127.0.0.1:4310
scripts/linux/start-training-data-tmux.sh --games 1000 --provider server_heuristic --backend-url http://127.0.0.1:4310
scripts/linux/start-training-data-tmux.sh --games 1000 --provider server_heuristic --backend-url http://127.0.0.1:4310 -noclear
scripts/linux/start-training-data-tmux.sh --session tichuml-training-test --games 1000 --provider server_heuristic --backend-url http://127.0.0.1:4310
scripts/linux/start-training-data-tmux.sh --games 1000 --skip-ml-export-check
```

Windows examples:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\start-training-data.ps1 -Games 1000 -Provider server_heuristic -BackendUrl http://127.0.0.1:4310
powershell -ExecutionPolicy Bypass -File scripts\stop-training-data.ps1 -SessionName tichuml-training-test
powershell -ExecutionPolicy Bypass -File scripts\start-sim.ps1 -Games 1 -Provider server_heuristic -Telemetry
powershell -ExecutionPolicy Bypass -File scripts\sim-doctor.ps1 -Help
powershell -ExecutionPolicy Bypass -File scripts\windows\start-training-data.ps1 -Games 1000 -Provider server_heuristic -BackendUrl http://127.0.0.1:4310
powershell -ExecutionPolicy Bypass -File scripts\windows\start-training-data.ps1 -Games 1000 -Provider server_heuristic -BackendUrl http://127.0.0.1:4310 -NoClear
powershell -ExecutionPolicy Bypass -File scripts\windows\start-training-data.ps1 -SessionName tichuml-training-test -Games 1000 -Provider server_heuristic -BackendUrl http://127.0.0.1:4310
powershell -ExecutionPolicy Bypass -File scripts\windows\start-training-data.ps1 -Games 1000 -SkipMlExportCheck
```

Key operator rules:

- Run `scripts/start-training-data.sh --help`,
  `scripts/linux/start-training-data-tmux.sh --help`, or
  `scripts/start-training-data.ps1 -Help` to see the full parameter list,
  defaults, session behavior, and artifact locations.
- `server_heuristic` training now stays on the normal fast-path request shape
  even when telemetry is full. The workflow no longer forces `--full-state`
  rich decision requests as the default server path.
- The `server_heuristic` training fix is the request-path correction above, not
  a larger timeout. The current launcher default is `2000ms`, and the timeout
  flag remains a diagnostic escape hatch rather than the primary fix.
- Use `--decision-timeout-ms` or `-DecisionTimeoutMs` only as a diagnostic
  escape hatch. It is not the primary fix for `server_heuristic` training
  behavior.
- Default mode is `CLEAR DATABASE MODE`; pass `-noclear` or `-NoClear` for
  `NO-CLEAR APPEND MODE`.
- Every run gets a unique `run_id`, a unique session or job name, a dedicated
  `training-runs/<run_id>/` directory, and a scoped export archive under
  `/tmp` on Linux or `$env:TEMP` on Windows.
- Current-run exports are isolated by the shared `game_id_prefix`
  `selfplay-<run_id>` and per-batch `selfplay-<run_id>-batch-XXXXXX` game IDs;
  they do not rely on database clearing alone.
- `ml:export` is checked in validation-only mode during the training workflow.
  The scripts do not run a full export dataset automatically.
- Server-backed fast-path training runs now persist enough scoped decision
  telemetry for `ml:export --validate-only` to confirm current-run
  LightGBM-compatible output readiness.
- Manual scoped export after a run is:
  `npm run ml:export -- --run-id <run_id> --game-id-prefix <game_id_prefix> --output-dir training-runs/<run_id>/ml`
- Manual ML output is written under `training-runs/<run_id>/ml` and includes
  LightGBM-ready metadata such as `dataset_metadata.json`,
  `feature_columns.json`, and `label_columns.json`.
- Direct simulator fallback from repo root remains:
  `cd C:\tichu\tichuml; npm.cmd run sim -- --games 1000 --provider server_heuristic --backend-url http://127.0.0.1:4310 --telemetry true --strict-telemetry false --telemetry-mode full --seed training-manual-20260504-01 --seed-prefix training-data --game-id-prefix selfplay-training-manual-20260504-01 --decision-timeout-ms 2000 --progress`

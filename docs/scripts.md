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
  sim-controller.sh
  start_backend_linux.sh
  start_backend_windows.ps1
  start_sim_controller_windows.ps1
  start_sim_windows.ps1
  status_backend_linux.sh
  status_backend_windows.ps1
  status_sim_controller_windows.ps1
  stop_backend_linux.sh
  stop_backend_windows.ps1
  stop_sim_controller_windows.ps1
  unblock_windows_scripts.ps1
  update_backend_linux.sh
  update_backend_windows.ps1
  verify-full-sim-backend.sh
  verify-sim-one-game-fixed.ps1
  linux/
    backend-common.sh
    bootstrap.sh
    force-sync.sh
    install-backend.sh
    restart-backend.sh
    reset-db.sh
    run-training-sim.sh
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
    sim-doctor.ps1
    start-backend.ps1
    start-sim-controller.ps1
    start-sim.ps1
    status-backend.ps1
    status-sim-controller.ps1
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

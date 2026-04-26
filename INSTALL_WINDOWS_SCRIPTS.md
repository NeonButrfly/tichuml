# tichuml Windows Startup Scripts

Drop these files into your repo under `scripts\`.

Default repo root: `C:\tichu\tichuml`

## First install

```powershell
Set-ExecutionPolicy -Scope Process Bypass -Force
powershell -ExecutionPolicy Bypass -File scripts\install_backend_windows.ps1
```

## Daily start/update

```powershell
powershell -ExecutionPolicy Bypass -File scripts\start_backend_windows.ps1
```

## Status

```powershell
powershell -ExecutionPolicy Bypass -File scripts\status_backend_windows.ps1
```

## Stop

```powershell
powershell -ExecutionPolicy Bypass -File scripts\stop_backend_windows.ps1
```

## Sim

```powershell
powershell -ExecutionPolicy Bypass -File scripts\start_sim_windows.ps1 -Games 100 -Provider server_heuristic -BackendUrl http://127.0.0.1:4310 -Telemetry
```

## Controller sim

```powershell
powershell -ExecutionPolicy Bypass -File scripts\start_sim_controller_windows.ps1 -GamesPerBatch 100 -WorkerCount 1 -Provider server_heuristic -BackendUrl http://127.0.0.1:4310
```

## Notes

- These scripts intentionally force-refresh the repo when update/start runs and `AUTO_UPDATE_ON_START=true`.
- Docker Desktop must be installed and running.
- Postgres uses the existing `docker-compose.yml`.
- Runtime files go under `.runtime\`.
- No `node_modules` are included.

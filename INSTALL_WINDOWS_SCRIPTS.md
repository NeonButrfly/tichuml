# tichuml Windows Startup Scripts

Default repo root: `C:\tichu\tichuml`

Canonical local database identity:

```text
POSTGRES_CONTAINER_NAME=tichu-postgres
POSTGRES_USER=tichu
POSTGRES_PASSWORD=tichu_dev_password
POSTGRES_DB=tichu
POSTGRES_PORT=54329
DATABASE_URL=postgres://tichu:tichu_dev_password@localhost:54329/tichu
PG_BOOTSTRAP_URL=postgres://tichu:tichu_dev_password@localhost:54329/postgres
```

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

## Reset mismatched Postgres

If `tichu-postgres` was created with the old identity
`POSTGRES_USER=postgres` or `POSTGRES_DB=tichuml`, the start scripts fail loudly.
Reset the local container and volume:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\reset_postgres_windows.ps1
```

## One-game telemetry diagnostic

```powershell
powershell -ExecutionPolicy Bypass -File scripts\verify-sim-one-game-fixed.ps1 -ClearDatabase
```

This creates `verify-one-game-<timestamp>.zip`, runs exactly one strict
telemetry simulator game, captures backend and telemetry health, captures DB
counts/latest rows, and fails unless decisions and events are actually present
in Postgres.

## Doctor

```powershell
npm run sim:doctor -- --backend-url http://127.0.0.1:4310
```

The doctor prints machine-readable JSON and separates backend health, DB
connection, direct telemetry POSTs, persistence, queue flush, and orphan-process
failures.

## DB monitor

```powershell
docker exec tichu-postgres psql -U tichu -d tichu -c "SELECT COUNT(*) FROM decisions;"
docker exec tichu-postgres psql -U tichu -d tichu -c "SELECT COUNT(*) FROM events;"
docker exec tichu-postgres psql -U tichu -d tichu -c "SELECT COUNT(*) FROM matches;"
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
- Startup stops a stale tichuml backend listener on port 4310 or fails loudly if another process owns the port.
- `/health` and `/api/telemetry/health` report PID, command line, cwd, sanitized `DATABASE_URL`, backend commit, mode, port, and telemetry health shape version.
- Queue accepted/persisted counters are diagnostics only. DB row counts are the source of truth.
- Docker Desktop must be installed and running.
- Postgres uses the existing `docker-compose.yml`.
- Runtime files go under `.runtime\`.
- No `node_modules` are included.

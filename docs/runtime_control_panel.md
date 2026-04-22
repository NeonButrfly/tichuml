# Linux Runtime Control Panel

Tracking issue: [#40](https://github.com/NeonButrfly/tichuml/issues/40)

The Linux backend host exposes a trusted-operator control panel at:

```text
/admin/control
```

On a default host this is:

```text
http://<backend-host>:4310/admin/control
```

## Scripts

Lifecycle entrypoints:

```sh
bash scripts/install_backend_linux.sh
bash scripts/start_backend_linux.sh
bash scripts/status_backend_linux.sh
bash scripts/update_backend_linux.sh
bash scripts/stop_backend_linux.sh --backend-only
bash scripts/stop_backend_linux.sh --full
```

`stop_backend_linux.sh --backend-only` stops the backend process and
backend-owned simulator controller processes, leaving Postgres running.
`stop_backend_linux.sh --full` also stops the Postgres container through the
shared Docker Compose helper.

The stop script is idempotent: already-stopped components are treated as
successful no-ops, stale pid files are removed, and only tracked backend,
simulator-controller, or configured-port listener processes are targeted.

## Startup Order

Startup and update flows preserve the force-overwrite Linux host policy:

```text
git fetch
git checkout <branch>
git reset --hard origin/<branch>
git clean -fd
```

The runtime stack then runs in this order:

1. load `.env`
2. ensure runtime directories
3. verify Git, curl, Node, npm, Python, Docker, and Docker Compose
4. install/update Node dependencies if needed
5. ensure Python venv and ML requirements
6. start Postgres and wait for `pg_isready`
7. build workspace packages in dependency order
8. verify required `dist` artifacts
9. run database migrations
10. start or restart the backend process
11. verify `/health`, decision, telemetry, simulator dashboard, and control panel routes

Migrations intentionally run after workspace builds so imports from workspace
package `dist` folders are available on fresh or force-synced hosts.

## Control Panel Features

Read-only status includes:

- backend pid, uptime, listener pids, runtime paths
- backend health, decision, telemetry, and control panel reachability
- Postgres container status and readiness
- Git branch, commits, ahead/behind, dirty state
- Node, npm, Python, Docker, and Compose availability
- Python venv, ML requirements stamp, LightGBM model presence
- backend/public/local URLs and recent backend/action logs

Mutating actions require:

```text
ENABLE_RUNTIME_ADMIN_CONTROL=true
x-admin-confirm: CLEAR_TICHU_DB
```

The page includes buttons for:

- Start backend
- Stop backend
- Restart backend
- Full restart
- Start Postgres
- Stop Postgres
- Update Repo
- Clear DB
- Apply config + restart
- Refresh status

Stop, restart, full restart, repo update, and DB reset open progress dialogs.
`Clear DB` requires an explicit Yes/No confirmation and then resets the
Postgres `public` schema before rerunning migrations. Mutating actions are
logged to `.runtime/actions.ndjson` and the panel polls live status/logs while
the action runs.

## Config Editing

The repo-root `.env` file is the single authoritative disk-backed runtime config
source. The backend reads it with the same structured env parser used by the
control-panel writer, not by shell evaluation. Linux scripts load config through
`scripts/runtime-config.mjs`, which parses `.env` and emits escaped exports for
known runtime defaults, avoiding direct `.env` sourcing.

The control panel validates known keys, rejects multiline values, writes
atomically, preserves comments and key order where possible, keeps unsupported
keys out of the edit path, and records pending restart state in
`.runtime/config-status.json`. Boolean values render as `true` / `false`
dropdowns and are rejected if submitted as anything else.

`BACKEND_HOST_IP` is a manual override. When it is blank or absent, scripts and
the panel detect the primary non-loopback IPv4 address and use that value for
default public URLs. The UI shows both the detected IP and the active override
state so refreshes do not hide which value is actually in use.

Most server/runtime settings require restart because they are loaded at process
startup. The control panel marks restart-required settings and provides an
apply-and-restart action.

## Runtime Files

Default runtime layout:

```text
.runtime/backend.pid
.runtime/backend.log
.runtime/actions.ndjson
.runtime/backend-update-status.env
.runtime/backend-update-status.json
.runtime/config-status.json
.runtime/sim-controller/
```

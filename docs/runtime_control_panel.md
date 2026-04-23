# Linux Runtime Control Panel

Tracking issues: [#40](https://github.com/NeonButrfly/tichuml/issues/40),
[#42](https://github.com/NeonButrfly/tichuml/issues/42)

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

Mutating actions require the Admin Safety panel to be unlocked:

```text
ENABLE_RUNTIME_ADMIN_CONTROL=true
```

The control panel no longer exposes or requires a `CLEAR_TICHU_DB` token input.
`Clear DB` is a real runtime action button with a Yes/No confirmation dialog.
When the safety lock is enabled, backend, Postgres, repo update, database reset,
and apply/restart actions are blocked and the UI shows the blocked action list.

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

The control panel separates saved disk config, unsaved form state, detected
values, and effective runtime values. Background status polling updates status
cards and logs but does not overwrite dirty form fields. Form values only change
on initial load, explicit reset, or successful save.

The backend returns a typed config schema for each item: key, type, category,
editability, restart requirement, description, saved value, effective value,
detected value, override flag, override value, and option lists for enum fields.
Boolean values render as `true` / `false` dropdowns. Enum values such as
`TELEMETRY_MODE` and `SIM_PROVIDER` are typed as `select`, render as dropdowns,
and are rejected if submitted outside their allowed values. Numeric settings
render as numeric inputs; free-text controls are reserved for unconstrained
strings such as URLs and paths. The browser renderer also treats any config
entry with an `options` array as a dropdown, even if an older or partially stale
payload still labels the entry as a string.

Simulator/controller defaults persisted by the runtime config API include:

- `SIM_PROVIDER`
- `SIM_BACKEND_URL`
- `SIM_WORKER_COUNT`
- `SIM_GAMES_PER_BATCH`
- `TELEMETRY_MODE`
- `TELEMETRY_MAX_POST_BYTES`
- `TELEMETRY_POST_TIMEOUT_MS`
- `TELEMETRY_RETRY_ATTEMPTS`
- `TELEMETRY_RETRY_DELAY_MS`
- `TELEMETRY_BACKOFF_MS`
- `TELEMETRY_INGEST_QUEUE_MAX_DEPTH`
- `TELEMETRY_PERSISTENCE_BATCH_SIZE`
- `TELEMETRY_PERSISTENCE_CONCURRENCY`

Automated fields use override toggles. The persisted `.env` stores only
`*_OVERRIDE_ENABLED` and `*_OVERRIDE` values. Detected values are never written
back to disk. When override is off, the UI disables the input and the effective
value comes from detection. When override is on, the saved override value becomes
the effective value.

IP detection ignores loopback and Docker-style interfaces where possible. It
prefers Ethernet names (`eth*`, `en*`, `eno*`, `ens*`), then wireless names
(`wlan*`, `wlp*`), then falls back to `127.0.0.1`. Status and config payloads
include `detectedEthernet`, `detectedWireless`, and `detectedDefault`, and all
runtime URL defaults flow from the same effective values.

Simulator/controller telemetry transport is local-first by default. Unless
`SIM_BACKEND_URL` is explicitly saved, the controller posts to
`BACKEND_LOCAL_URL` / `http://127.0.0.1:<PORT>` rather than the public operator
URL. The config panel shows `SIM_BACKEND_URL` as the effective controller value
so the runtime UI, controller launch args, and shared telemetry client use the
same endpoint.

Most server/runtime settings require restart because they are loaded at process
startup. Restart pending is computed from actual disk-versus-loaded runtime
config deltas and is shown as `Yes` or `No`, never as a health failure. The
control panel marks restart-required settings and provides an apply-and-restart
action.

The Git panel distinguishes clean/current, dirty, ahead/behind, and unknown
states. Clean/current is healthy; dirty or ahead/behind states are explicit
operator states, not generic failures. Restart pending is displayed only as
`Yes` or `No` in the runtime panel and is not duplicated as a second health
status block.

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

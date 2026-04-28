# TichuML

TichuML is a deterministic Tichu platform monorepo with:

- an authoritative TypeScript rules engine
- headless AI round execution and telemetry capture
- a responsive React table UI with table-editor tooling
- a local backend for entropy, telemetry ingest, decision routing, and replay reads
- replay, debugging, and simulation foundations

The repository no longer reflects a Milestone 0-only scaffold. Historical milestone labels still exist in a few runtime constants and tests for compatibility, but the working project has advanced well beyond the bootstrap stage.

## Current Workspace

- `apps/web` - live game client, responsive table UI, table editor, dialogs, and local app state
- `apps/server` - HTTP JSON API for health, entropy, telemetry, replay reads, and server-side heuristic routing
- `apps/sim-runner` - deterministic headless round execution for batch and integration flows
- `packages/engine` - authoritative rules engine, deterministic shuffle, trick resolution, scoring
- `packages/ai-heuristics` - heuristic AI decision policy and explanation output
- `packages/telemetry` - append-only decision/event telemetry helpers
- `packages/shared` - shared metadata, seed provenance types, and cross-package helpers
- `packages/ui-kit` - reusable UI primitives
- `infra/db` - migrations and migration runner
- `docker-compose.yml` - local Postgres compose stack
- `ml` - LightGBM feature building, export, training, and inference scripts
- `docs` - architecture, milestone history, telemetry, product, UI, and workflow notes
- `tests` - integration and replay-oriented validation

## Commands

- `npm install`
- `npm run lint`
- `npm run test`
- `npm run build`
- `npm run dev:web`
- `npm run dev:server`
- `npm run db:up`
- `npm run db:migrate`
- `npm run bootstrap:windows`
- `npm run bootstrap:unix`
- `npm run sim -- --games 100 --provider local`
- `npm run ml:export -- --phase play`
- `npm run ml:train -- --phase play`
- `npm run ml:bootstrap -- --games 1000 --provider server_heuristic`

## Backend Foundation

GitHub issue [#30](https://github.com/NeonButrfly/tichuml/issues/30) tracks the backend foundation work. It intentionally sits outside the active gameplay/UI stabilization milestone stream because it is a cross-cutting backend/platform foundation rather than another table-layout bugfix.

### One-command local backend startup

Windows PowerShell:

```powershell
npm run bootstrap:windows
```

If Windows blocks repo scripts after download or extract, unblock them first:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\unblock-scripts.ps1
```

Windows watch mode:

```powershell
npm run bootstrap:windows -- -Dev
```

macOS / Linux:

```sh
npm run bootstrap:unix
```

macOS / Linux watch mode:

```sh
npm run bootstrap:unix -- --dev
```

Those scripts:

- create `.env` from `.env.example` when missing
- install workspace dependencies
- create `.venv` when missing and install `ml/requirements.txt`
- start Postgres through Docker Compose
- wait for DB readiness
- run SQL migrations
- start the backend server

### Backend env defaults

The root `.env.example` now includes:

- `DATABASE_URL`
- `PG_BOOTSTRAP_URL`
- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `POSTGRES_PORT`
- `PORT`
- `HOST`
- `BACKEND_BASE_URL`
- `BACKEND_HOST_IP`
- `AUTO_BOOTSTRAP_DATABASE`
- `AUTO_MIGRATE`
- `AUTO_UPDATE_ON_START`
- `GIT_BRANCH`
- `REPO_URL`
- `PYTHON_EXECUTABLE`
- `LIGHTGBM_INFER_SCRIPT`
- `LIGHTGBM_MODEL_PATH`
- `LIGHTGBM_MODEL_META_PATH`
- `VITE_DECISION_MODE`
- `VITE_BACKEND_BASE_URL`
- `VITE_SERVER_FALLBACK_ENABLED`
- `VITE_TELEMETRY_ENABLED`

`apps/server/.env.example` mirrors the server-specific defaults when you want a backend-only env reference.

### Linux backend host

GitHub issue [#33](https://github.com/NeonButrfly/tichuml/issues/33) and milestone [Linux Backend Deployment + ML Host](https://github.com/NeonButrfly/tichuml/milestone/25) track the dedicated Linux-host workflow.

Target backend URL:

- `http://192.168.50.36:4310`

Linux install/bootstrap:

```sh
bash scripts/linux/install-backend.sh
```

The installer is idempotent and only installs missing system dependencies. It supports Ubuntu/Debian-family hosts with `apt-get` and Oracle Linux 9 / RHEL-family hosts with `dnf` or `yum`.

On a clean Ubuntu/Debian host with no existing Docker/Node stack it installs:

- `ca-certificates`
- `git`
- `curl`
- `jq`
- `python3`
- `python3-venv`
- `python3-pip`
- `docker.io`
- `docker-compose-plugin`, `docker-compose-v2`, `docker-compose`, or a manual Compose CLI plugin when no distro package is available
- `nodejs`
- `npm`

On a clean Oracle Linux 9 / RHEL-family host with no existing Docker/Node stack it installs:

- `ca-certificates`
- `git`
- `curl`
- `jq`
- `python3`
- `python3-pip`
- `python3-virtualenv`
- `docker`
- `docker-compose-plugin`, `docker-compose`, or a manual Compose CLI plugin when no distro package is available
- Node.js 20 and `npm`

If Docker is already present from another package source, the installer reuses it and ensures Compose is available through `docker compose` or `docker-compose`. If Node.js is missing or insufficient on Oracle/RHEL, the installer first tries the distro Node.js 20 module and then falls back to the supported NodeSource RPM setup for Node.js 20. The shared Linux bootstrap helper initializes `BACKEND_REPO_ROOT` safely under `set -u`, runs Docker Compose from the repo root without depending on the newer `--env-file` flag, and supports both `docker compose` and `docker-compose`.

The Linux installer now prints the exact command it is about to run before:

- `apt-get update`
- `apt-get install`
- `dnf install` / `yum install`
- `systemctl enable --now docker`
- repo clone/refresh
- helper/env sourcing
- `npm install`
- Python venv creation and `pip install`
- `docker compose up -d postgres`
- Postgres readiness waits
- migrations
- backend start

When `apt` is busy, the installer no longer appears to hang after `Installing system dependencies`. It now:

- detects apt/dpkg lock contention before `apt-get update` and `apt-get install`
- prints the active `apt` / `dpkg` / `unattended-upgrade` process while waiting
- waits up to `180s` by default (`APT_LOCK_WAIT_SECONDS`)
- times out `apt-get update` after `300s` by default (`APT_UPDATE_TIMEOUT_SECONDS`)
- times out `apt-get install` after `900s` by default (`APT_INSTALL_TIMEOUT_SECONDS`)
- writes the apt command output to `/tmp/tichuml-apt-*.log`
- fails with a classified message for lock contention, apt network/mirror failures, package conflicts, or missing package candidates instead of silently stalling

Linux start/update flow:

```sh
bash scripts/linux/start-backend.sh
```

On Linux, backend startup force-syncs the checked-out repo before starting the runtime stack. This is intentionally destructive for local source changes on the backend host and runs only from `scripts/linux/start-backend.sh`, not from simulator commands or unrelated CLI workflows. The installer and update scripts use the same force-overwrite policy. The sync uses:

- `git remote set-url origin ...`
- `git fetch --prune origin main`
- `git checkout main`
- `git reset --hard origin/main`
- `git clean -fd`

For systemd deployments, wire the same sync as:

```ini
ExecStartPre=/path/to/tichuml/scripts/linux/force-sync.sh
```

If the sync fails, the backend must not start.

Manual Linux update-only flow:

```sh
bash scripts/linux/update-backend.sh
```

Status/health check:

```sh
bash scripts/linux/status-backend.sh
```

Stop backend services:

```sh
bash scripts/linux/stop-backend.sh --backend-only
bash scripts/linux/stop-backend.sh --full
```

The backend host also serves a trusted-operator runtime control panel at:

```text
http://<backend-host>:4310/admin/control
```

Mutating control-panel actions require `ENABLE_RUNTIME_ADMIN_CONTROL=true` and
the confirmation token `CLEAR_TICHU_DB`.

No systemd unit is added in-repo yet. The intended service entrypoint is `bash /path/to/tichuml/scripts/linux/start-backend.sh`, with `bash /path/to/tichuml/scripts/linux/status-backend.sh` as the companion health/status check.

Those scripts:

- install Linux host dependencies
- clone or force-update the repo to the configured remote branch
- create `.env` if missing
- create `.venv` and install ML requirements
- start Docker/Postgres with Postgres bound to loopback only
- build backend/simulator/web runtime artifacts before migrations
- run migrations only after required workspace `dist` artifacts exist
- force-sync Linux backend source on startup before the backend starts
- record last update state in `.runtime/backend-update-status.env` and `.runtime/backend-update-status.json`
- expose runtime status/actions/config editing through `/admin/control`

Linux-host recovery:

- `apt` lock held by unattended-upgrades:
  Wait for the lock to clear or inspect the holder with `ps -ef | grep -E 'apt|dpkg|unattended'`. If you intentionally need to stop unattended upgrades first, run `sudo systemctl stop unattended-upgrades`, then rerun `bash scripts/linux/install-backend.sh`.
- Missing Docker repo / partial Docker CE family:
  If the host has `containerd.io`, `docker-ce`, or `docker-ce-cli` but no working `docker` command, either finish configuring Docker's apt repository and install `docker-ce docker-ce-cli docker-compose-plugin`, or remove the partial Docker CE packages before rerunning the installer. The script will not force Ubuntu `docker.io` over that partial state.
- Dirty repo:
  `scripts/linux/install-backend.sh`, `scripts/linux/update-backend.sh`, and Linux startup intentionally force remote state over local changes with `fetch`, `checkout`, `reset --hard`, and `clean -fd`. Save anything you need somewhere else before running backend install/start/update on a host.
- Missing `npm` with `node` already present:
  On Ubuntu/Debian, install `npm` from the same Node distribution already on the host, or reinstall Node with npm included. On Oracle/RHEL, rerun the installer so it can enable/install Node.js 20 with npm.
- Docker daemon not active:
  Run `sudo systemctl enable --now docker`, then rerun `bash scripts/linux/status-backend.sh` or `bash scripts/linux/start-backend.sh`. If the daemon is running but access is denied, add the service user to the `docker` group and sign in again before retrying.
- Missing Docker Compose package:
  Rerun `bash scripts/linux/install-backend.sh`. It tries distro Compose packages first and then installs a pinned Compose CLI plugin in `/usr/local/lib/docker/cli-plugins`.

Remote clients should set the runtime backend URL in the app to:

- `http://192.168.50.36:4310`

The client already persists that runtime override through the `Backend Settings` panel.

### Runtime decision and telemetry settings

The web client now exposes backend runtime settings in the hamburger menu under `Backend Settings`.

That dialog lets you change, at runtime and without rebuild:

- `Decision Mode` (`local`, `server_heuristic`, or `lightgbm_model`)
- `Backend Base URL`
- `Server Fallback`
- `Telemetry Enabled`
- backend health test/status

Env values provide first-run defaults. After the first UI change, the client persists the effective values in `localStorage` and uses those persisted settings on later runs.

### Self-play and LightGBM workflow

Run a local self-play batch:

```powershell
npm run sim -- --games 100 --provider local --telemetry false
```

```powershell
npm run sim -- --games 1000 --provider server_heuristic --progress
```

The simulator:

- plays complete hands from the current engine
- supports `local`, `server_heuristic`, and `lightgbm_model`
- records pass/exchange/pickup/play telemetry when telemetry is enabled
- prints a summary with games, hands, decisions by phase, provider usage, fallbacks, and exchange/pass coverage

The combined end-to-end bootstrap is:

```powershell
npm run ml:bootstrap -- --games 5000 --provider server_heuristic
```

That runs self-play, exports training rows, and trains the first model in sequence.

Provider evaluation:

```powershell
npm run ml:evaluate -- --games 500 --ns-provider lightgbm_model --ew-provider server_heuristic
```

```sh
npm run ml:evaluate -- --games 500 --ns-provider lightgbm_model --ew-provider server_heuristic
```

That evaluation path:

- uses the real simulator and legal-action generator
- supports team-level or seat-level provider assignment
- writes machine-readable summaries to `eval/results/latest_summary.json` and a timestamped `eval/results/*.json`
- reports win counts, win rate, score margin, provider usage, fallback count, invalid decisions, pass rate, bomb usage, wish satisfaction, and average decision latency by provider

Export action rows from Postgres:

```powershell
npm run ml:export -- --phase play
```

```sh
npm run ml:export -- --phase play
```

That export reads raw decision telemetry from Postgres; make sure the backend/database bootstrap is running first.

Train the LightGBM action model:

```powershell
npm run ml:train -- --phase play
```

```sh
npm run ml:train -- --phase play
```

Both commands prefer the repo `.venv` automatically when it exists, so they use the same Python environment created by the bootstrap scripts.

Export supports optional filters such as:

```powershell
npm run ml:export -- --phase play --provider server_heuristic --limit 50000
```

Training writes:

The training path writes:

- `ml/model_registry/lightgbm_action_model.txt`
- `ml/model_registry/lightgbm_action_model.meta.json`
- `ml/feature_schema.json`

The first training phase is `play` (`trick_play` in stored telemetry). Exchange and pass phases are still recorded in raw telemetry and replay, but the initial supervised export defaults to trick-play decisions.

Switch to the model at runtime from hamburger menu -> `Backend Settings` -> `Decision Mode` -> `LightGBM model`.

### Firewall

On the Linux backend host, expose only the HTTP API:

```sh
sudo ufw allow 4310
```

Do not expose Postgres publicly. `docker-compose.yml` now binds Postgres to `127.0.0.1` only.

### Exchange telemetry

Issue [#31](https://github.com/NeonButrfly/tichuml/issues/31) keeps exchange telemetry phase-specific. The client now records:

- `pass_select` decisions for pass-card submission
- `pass_reveal` advancement decisions when exchange resolution occurs
- `exchange_complete` pickup decisions before trick play resumes

Replay reads preserve those phases instead of collapsing exchange into trick play.

### Manual verification

Health:

```powershell
Invoke-RestMethod http://localhost:4310/health
```

```sh
curl http://localhost:4310/health
```

Replay reads:

```powershell
Invoke-RestMethod http://localhost:4310/api/games/<game-id>/replay
```

Linux host health:

```sh
curl http://127.0.0.1:4310/health
curl http://192.168.50.36:4310/health
```

Server decision request example:

```powershell
$body = @{
  game_id = "manual-test"
  hand_id = "hand-1"
  phase = "grand_tichu_window"
  actor_seat = "seat-0"
  schema_version = 2
  engine_version = "milestone-1"
  sim_version = "milestone-2"
  state_raw = @{ phase = "grand_tichu_window" }
  state_norm = @{ phase = "grand_tichu_window" }
  legal_actions = @{ "seat-0" = @(@{ type = "decline_grand_tichu"; seat = "seat-0" }) }
  requested_provider = "lightgbm_model"
  metadata = @{ decision_index = 0 }
} | ConvertTo-Json -Depth 8

Invoke-RestMethod http://localhost:4310/api/decision/request -Method Post -ContentType "application/json" -Body $body
```

Telemetry lands in Postgres `decisions` and `events` as append-only records. Replay reads combine those ordered streams for timeline reconstruction.

## Documentation Map

- [SPEC](./spec.md) - long-form project specification and milestone plan
- [Docs Index](./docs/README.md) - quick navigation across architecture, UI, telemetry, and workflow notes
- [Milestones](./docs/milestones/README.md) - normalized milestone history and commit-subject guidance
- [GitHub Issues](https://github.com/NeonButrfly/tichuml/issues) - authoritative bug and task tracker
- [GitHub Milestones](https://github.com/NeonButrfly/tichuml/milestones) - authoritative milestone and release buckets
- [Architecture Notes](./docs/architecture/README.md)
- [Product Notes](./docs/product/README.md)
- [UI Notes](./docs/ui/README.md)
- [Telemetry Notes](./docs/telemetry/README.md)
- [Prompt Capture And Workflow Notes](./docs/prompts/README.md)

## Milestone Snapshot

The current major backend/platform stream now lives in GitHub milestone [`6.5 – Local ML Integration & Reproducible Backend`](https://github.com/NeonButrfly/tichuml/milestone/24), while the open gameplay/UI stabilization stream remains [`6.4 – Gameplay & UX Stabilization`](https://github.com/NeonButrfly/tichuml/milestone/23). GitHub milestones and GitHub issues are the authoritative project tracker. The canonical milestone plan still lives in [SPEC](./spec.md), while the normalized repository history and current GitHub milestone-to-issue mapping now live in [docs/milestones/README.md](./docs/milestones/README.md).

Prompt-capture notes in [`docs/prompts`](./docs/prompts/README.md) preserve prompt intent and issue links only. They are not a parallel tracker; status stays in GitHub.

When making new milestone commits, prefer:

```text
Milestone <id>: <short scope summary>
```

Example:

```text
Milestone 6.3: stabilize canonical table layout schema
```

Use the commit body for:

- why the milestone was needed
- key engine/UI/server changes
- tests and validation

Milestone 6.3 currently targets:

- GitHub issue [#14](https://github.com/NeonButrfly/tichuml/issues/14)
- one canonical data-driven table layout schema in `apps/web/src/table-layout.ts`
- shared seat anchors for labels, call badges, turn badges, out badges, trick zones, pickup zones, and pass lanes
- per-seat trick and pickup staging driven from schema anchors instead of ad hoc component offsets
- same-team Tichu / Grand Tichu stacking prevented in both engine eligibility and deterministic bot scoring

Milestone 6.2 still targets:

- GitHub issue [#13](https://github.com/NeonButrfly/tichuml/issues/13)
- one canonical deterministic heuristics policy shared by the web client and simulator
- stronger hand-structure-aware play selection, passing, wish choice, Dragon gifting, and Tichu / Grand Tichu evaluation
- explicit exclusion of legacy ML inference tooling from the active bot path

Milestone 6.1.5 still targets:

- GitHub issue [#12](https://github.com/NeonButrfly/tichuml/issues/12)
- shared exchange render buckets so pass-selection, in-transit, and pickup cards stay in exactly one visible state
- pickup staging for all seats during the explicit Pickup step, without leaking cards into hands early
- stronger AI hand evaluation for pass selection and Tichu / Grand Tichu decisions

Milestone 6.1.4 still targets:

- GitHub issue [#11](https://github.com/NeonButrfly/tichuml/issues/11)
- seat-local trick staging instead of a shared center play pile
- visible pickup-lane staging for received exchange cards until explicit Pickup
- engine-resolved Dog lead-transfer animation
- compact `T` / `GT` seat markers and gameplay-safe center-surface cleanup

Milestone 6.1.3 currently targets:

- GitHub issue [#3](https://github.com/NeonButrfly/tichuml/issues/3)
- active response turns resolving through play/pass instead of stalling on optional Tichu handling
- editor-only center felt/shadow rendering with no gameplay glow residue

Milestone 6.1.2 still targets:

- GitHub issue [#2](https://github.com/NeonButrfly/tichuml/issues/2)
- removal of directional indicators from live trick rendering
- central current-trick point display and editor-only play-surface shadow

Milestone 6.1.1 still targets:

- GitHub issue [#1](https://github.com/NeonButrfly/tichuml/issues/1)
- shared rank-first combo normalization across engine legality, selection matching, and concrete play validation
- regression coverage across all combo-response families

Milestone 6.1 still adds:

- GitHub issue [#10](https://github.com/NeonButrfly/tichuml/issues/10)
- centralized human turn action availability derived from engine legal actions
- protection against the illegal Tichu-only progression state on an active response turn
- straight-response and wish-fallback regression coverage for play/pass legality

Milestone 6.0 still covers:

- GitHub issues [#7](https://github.com/NeonButrfly/tichuml/issues/7), [#8](https://github.com/NeonButrfly/tichuml/issues/8), and [#9](https://github.com/NeonButrfly/tichuml/issues/9)
- server-backed multi-source entropy collection and deterministic shuffle seed derivation
- Random Sources inspection UI and related debug surfaces
- exchange / pickup / cumulative-score / score-history flow hardening
- Mahjong wish enforcement and no-stall engine safeguards

The git milestone history has been normalized to the shared `Milestone <id>: <scope>` format, and the current milestone map lives in [docs/milestones/README.md](./docs/milestones/README.md).

# Backend Prompt Log

Prompt logs here capture backend/platform prompt intent only. GitHub issue state remains authoritative.

## 2026-04-17 - Local backend foundation with Postgres, telemetry, decision routing, and one-command bootstrap

- Prompt signal:
  Build the first complete backend foundation for TichuML so the project can run a fully wired local backend with database, telemetry ingest, decision routing, replay/read endpoints, shared contracts, UI backend settings, and portable bootstrap on Windows/macOS/Linux from a single installation/start script.
- Interpreted requirement:
  Expand the repo from entropy-only server behavior into a backend foundation that keeps the current playable client alive while adding Postgres-backed telemetry persistence, a server heuristic provider path, replay/read APIs, and runtime backend controls in the UI.
- Affected systems:
  `apps/server`, `infra/db`, `apps/web`, `packages/shared`, docs, bootstrap scripts.
- Linked GitHub issue:
  [#30](https://github.com/NeonButrfly/tichuml/issues/30)
- Milestone:
  None intentionally. This backend/platform foundation sits outside the active gameplay/UI stabilization milestone stream until a dedicated GitHub backend milestone exists.
- Status:
  Lives in GitHub, not here.

## 2026-04-18 - Reproducible backend milestone with Docker Postgres, LightGBM provider, exchange telemetry, and heuristic baseline lock

- Prompt signal:
  Create a clean milestone that snapshots the current repo state, standardizes Docker Postgres bootstrap, adds a LightGBM training/inference pipeline, wires LightGBM as a selectable decision provider, fixes missing exchange/pass telemetry, and carries the stronger shallow-lookahead local heuristic baseline forward without regressions.
- Interpreted requirement:
  The repo needs one coherent milestone that upgrades the backend/platform path from heuristic-only Postgres telemetry into a reproducible local ML-capable stack while preserving gameplay safety, deterministic fallback behavior, and full exchange-phase replay fidelity.
- Affected systems:
  `docker-compose.yml`, `scripts/bootstrap.*`, `apps/server`, `apps/web`, `packages/shared`, `ml/*`, docs, telemetry/replay validation.
- Linked GitHub issue:
  [#31](https://github.com/NeonButrfly/tichuml/issues/31)
- Milestone:
  [6.5 – Local ML Integration & Reproducible Backend](https://github.com/NeonButrfly/tichuml/milestone/24)
- Status:
  Lives in GitHub, not here.

## 2026-04-19 - Linux backend deployment host with auto-update and provider evaluation

- Prompt signal:
  Build a complete Linux backend system where one Linux box hosts Docker/Postgres, the backend API, self-play simulation, LightGBM training/inference, remote client connectivity, safe startup-time Git updates, health/status reporting, and provider-vs-provider evaluation with machine-readable summaries.
- Interpreted requirement:
  The backend/ML foundation must graduate from local bootstrap only into a host-grade Linux deployment path with install/start/update/status scripts, private Postgres exposure, remote API access at `http://192.168.50.36:4310`, and an honest evaluation harness that compares heuristic and LightGBM providers on the real simulator.
- Affected systems:
  `scripts/*.sh`, `docker-compose.yml`, `.env*`, `apps/sim-runner/src/*`, `ml/*`, backend configuration/docs, evaluation output paths.
- Linked GitHub issue:
  [#33](https://github.com/NeonButrfly/tichuml/issues/33)
- Milestone:
  [Linux Backend Deployment + ML Host](https://github.com/NeonButrfly/tichuml/milestone/25)
- Status:
  Lives in GitHub, not here.

## 2026-04-20 - Linux backend bootstrap hardening for Ubuntu install/start reliability

- Prompt signal:
  Fix the Linux backend bootstrap/install/start flow so a fresh Ubuntu host can reliably install and start the backend stack without hanging or crashing, especially around unattended-upgrades apt locks, package conflicts, helper initialization, and incomplete Docker/Node environments.
- Interpreted requirement:
  The Linux-host scripts must stop failing silently during `apt-get update` / `apt-get install`, must classify common Ubuntu host failures clearly, must keep dirty repos safe, and must surface incomplete Docker/Node/npm/Compose prerequisites honestly in both install and status flows.
- Affected systems:
  `scripts/install_backend_linux.sh`, `scripts/backend-linux-common.sh`, `scripts/start_backend_linux.sh`, `scripts/update_backend_linux.sh`, `scripts/status_backend_linux.sh`, `README.md`.
- Linked GitHub issue:
  [#33](https://github.com/NeonButrfly/tichuml/issues/33)
- Milestone:
  [Linux Backend Deployment + ML Host](https://github.com/NeonButrfly/tichuml/milestone/25)
- Status:
  Lives in GitHub, not here.

## 2026-04-21 - Linux startup force-sync and server_heuristic actor contract hardening

- Prompt signal:
  Force-sync the Linux backend host source tree on backend startup only, and fix `server_heuristic` decision requests so `actor_seat` always matches the canonical active actor derived from the supplied state snapshot.
- Interpreted requirement:
  Linux backend startup must destructively synchronize `/opt/tichuml` with `origin/main` before the backend starts, while simulator/backend decision routing must share one canonical active actor helper, pre-send validation, backend validation diagnostics, and regression tests that prevent seat rotation or stale actor leakage.
- Affected systems:
  `scripts/force-sync.sh`, `scripts/start_backend_linux.sh`, `packages/engine/src/seat-identity.ts`, `apps/sim-runner/src/self-play-batch.ts`, `apps/server/src/providers/*`, `apps/server/src/routes/router.ts`, tests, docs.
- Linked GitHub issues:
  [#33](https://github.com/NeonButrfly/tichuml/issues/33), [#34](https://github.com/NeonButrfly/tichuml/issues/34)
- Milestone:
  [Linux Backend Deployment + ML Host](https://github.com/NeonButrfly/tichuml/milestone/25)
- Status:
  Lives in GitHub, not here.

## 2026-04-21 - Debian and Oracle/RHEL Linux backend installer portability

- Prompt signal:
  Make Linux backend install/start/status/update scripts work on both Ubuntu/Debian-family systems and Oracle Linux 9 / RHEL-family systems without assuming `apt`, without assuming a distro Docker Compose package exists, and without skipping dirty repo updates.
- Interpreted requirement:
  Add package-manager detection for `apt-get`, `dnf`, and `yum`; ensure Docker Compose through `docker compose`, `docker-compose`, distro packages, or a manual CLI plugin; force-sync repo state during install/start/update; write shell-safe update status env files; and keep the current Ubuntu backend flow working.
- Affected systems:
  `scripts/install_backend_linux.sh`, `scripts/backend-linux-common.sh`, `scripts/start_backend_linux.sh`, `scripts/update_backend_linux.sh`, `scripts/status_backend_linux.sh`, `scripts/force-sync.sh`, `README.md`.
- Linked GitHub issue:
  [#33](https://github.com/NeonButrfly/tichuml/issues/33)
- Milestone:
  [Linux Backend Deployment + ML Host](https://github.com/NeonButrfly/tichuml/milestone/25)
- Status:
  Lives in GitHub, not here.

## 2026-04-21 - Telemetry pipeline contract, ML storage, and guarded admin reset endpoints

- Prompt signal:
  Fully line up the telemetry pipeline across sim runner, backend ingestion, database storage, ML export, and evaluation so the data is consistent, queryable, and useful for training. Add explicit admin API endpoints to clear telemetry data or reset the development database.
- Interpreted requirement:
  Issue [#35](https://github.com/NeonButrfly/tichuml/issues/35) tracks a canonical telemetry contract with strict ingestion validation, actor-scoped decision legality checks, raw-plus-extracted decision/event storage, ML exporter alignment, and destructive admin endpoints protected by both env and confirmation-token safeguards.
- Affected systems:
  `packages/shared`, `apps/server`, `apps/sim-runner`, `apps/web/src/backend/telemetry.ts`, `infra/db/migrations`, `ml/export_training_rows.py`, telemetry/admin docs, backend telemetry tests.
- Linked GitHub issue:
  [#35](https://github.com/NeonButrfly/tichuml/issues/35)
- Milestone:
  [6.5 - Local ML Integration & Reproducible Backend](https://github.com/NeonButrfly/tichuml/milestone/24)
- Status:
  Lives in GitHub, not here.

## 2026-04-21 - Simulator controller control plane and dashboard

- Prompt signal:
  Add a controller-style simulator control plane for background self-play execution, including a web control dashboard, simulator status surface, worker/thread support, controller script, and safe admin control endpoints.
- Interpreted requirement:
  Issue [#37](https://github.com/NeonButrfly/tichuml/issues/37) tracks a Linux-friendly operations layer for long-running self-play with guarded admin APIs, singleton lock semantics, pause/continue/stop at safe batch boundaries, heartbeat/runtime/log files, worker-level status, worker IDs in telemetry, and a browser dashboard plus CLI wrapper.
- Affected systems:
  `packages/shared`, `apps/server`, `apps/sim-runner`, `apps/web`, `scripts`, docs, backend integration tests, telemetry storage/export.
- Linked GitHub issue:
  [#37](https://github.com/NeonButrfly/tichuml/issues/37)
- Milestone:
  [6.5 - Local ML Integration & Reproducible Backend](https://github.com/NeonButrfly/tichuml/milestone/24)
- Status:
  Lives in GitHub, not here.

## 2026-04-21 - Linux migration bootstrap shared-dist failure

- Prompt signal:
  Linux migration failed with `ERR_MODULE_NOT_FOUND` for `/opt/tichuml/node_modules/@tichuml/shared/dist/index.js` imported from `infra/db/scripts/migrate.ts`.
- Interpreted requirement:
  Issue [#38](https://github.com/NeonButrfly/tichuml/issues/38) tracks removing DB migration startup's dependency on built workspace package artifacts so fresh or force-synced Linux hosts can run migrations before package `dist/` output exists.
- Affected systems:
  `infra/db/scripts/migrate.ts`, `apps/server/src/db/migrations.ts`, Linux backend startup.
- Linked GitHub issue:
  [#38](https://github.com/NeonButrfly/tichuml/issues/38)
- Milestone:
  [Linux Backend Deployment + ML Host](https://github.com/NeonButrfly/tichuml/milestone/25)
- Status:
  Lives in GitHub, not here.

## 2026-04-22 - Runtime control panel typed schema and safety lock follow-up

- Prompt signal:
  The current `/admin/control` page still exposes a `CLEAR_TICHU_DB` token field,
  can wipe edits during polling, uses raw env names without enough typing, and
  needs an Admin Safety lock plus automated-field override toggles.
- Interpreted requirement:
  Issue [#40](https://github.com/NeonButrfly/tichuml/issues/40) also covers the
  typed-config follow-up: config payloads must separate saved form state,
  effective runtime values, detected values, and override state; polling must not
  overwrite dirty form edits; action-style env values must become real buttons;
  Admin Safety must persist and block runtime actions when locked; automated
  network fields must store only override flags/values while using centralized
  detected/effective values everywhere.
- Affected systems:
  `apps/server/src/config`, `apps/server/src/routes/router.ts`,
  `apps/server/src/services/runtime-admin-service.ts`,
  `apps/server/src/services/runtime-control-panel.ts`,
  `scripts/runtime-config.mjs`, `.env.example`, docs, backend integration tests.
- Linked GitHub issue:
  [#40](https://github.com/NeonButrfly/tichuml/issues/40)
- Milestone:
  [Linux Backend Deployment + ML Host](https://github.com/NeonButrfly/tichuml/milestone/25)
- Status:
  Lives in GitHub, not here.

## 2026-04-22 - Simulator backend decision fallback for zero-game batches

- Prompt signal:
  Backend-mode simulator batches were ending with `gamesPlayed: 0`,
  `decisionsRecorded: 0`, `eventsRecorded: 0`, and `errors: 10`; fix the
  simulator/backend integration so preventable `/api/decision/request` payload
  failures do not kill every game opaquely.
- Interpreted requirement:
  Issue [#41](https://github.com/NeonButrfly/tichuml/issues/41) tracks full
  `state_raw` pre-send validation for backend decision providers, explicit
  structured logs for payload validation/network/backend-rejection/invalid
  response failures, and a config-driven local heuristic fallback path when
  backend-mode decisions cannot be served safely.
- Affected systems:
  `apps/sim-runner/src/self-play-batch.ts`,
  `apps/sim-runner/src/cli.ts`,
  `apps/server/src/services/sim-controller-service.ts`,
  `packages/shared/src/backend.ts`, backend integration tests.
- Linked GitHub issue:
  [#41](https://github.com/NeonButrfly/tichuml/issues/41)
- Milestone:
  [Linux Backend Deployment + ML Host](https://github.com/NeonButrfly/tichuml/milestone/25)
- Status:
  Lives in GitHub, not here.

## 2026-04-21 - Simulator controller admin dashboard routes return 404

- Prompt signal:
  The sim controller is 404 at `https://192.168.50.196:4310/admin/sim` and
  `/sim/control`.
- Interpreted requirement:
  Issue [#39](https://github.com/NeonButrfly/tichuml/issues/39) tracks making the
  Linux backend host serve the built simulator controller dashboard at both
  operator entrypoints, including the Vite assets needed by direct browser
  navigation on the backend origin. Follow-up live validation showed the host can
  remain on a running/stale process, so the Linux start/status flow must also
  validate the dashboard routes after update/restart and replace unmanaged
  listeners on the configured backend port. Once the dashboard loaded on the
  remote host, it exposed a second defect: the dashboard defaulted API calls to
  `http://localhost:4310`, which is wrong for remote browsers. The dashboard
  default backend URL must use the current `:4310` page origin when served from
  the backend host, and should recover from a stale saved localhost URL after a
  network failure.
- Affected systems:
  `apps/server`, `apps/web`, `scripts/backend-linux-common.sh`, simulator
  dashboard docs, backend integration tests, Linux status/start scripts.
- Linked GitHub issue:
  [#39](https://github.com/NeonButrfly/tichuml/issues/39)
- Milestone:
  None intentionally. This is a focused route-hosting bug, not a milestone-sized
  product scope.
- Status:
  Lives in GitHub, not here.

## 2026-04-22 - Linux backend lifecycle stop script and runtime control panel

- Prompt signal:
  Create a clean stop-server script, restore detailed operational startup
  output, and add a system-wide web control panel that shows every backend host
  component plus editable env/settings with safe apply/restart behavior.
- Interpreted requirement:
  Issue [#40](https://github.com/NeonButrfly/tichuml/issues/40) tracks a
  production-minded Linux backend operations layer: idempotent backend/full stop,
  detailed start/status/update logs, build-before-migration ordering, runtime
  status/config/action APIs, a backend-hosted `/admin/control` panel, safe `.env`
  editing, and dynamic apply/restart workflow while preserving Ubuntu/Debian and
  Oracle/RHEL compatibility.
- Affected systems:
  `scripts/backend-linux-common.sh`, `scripts/install_backend_linux.sh`,
  `scripts/start_backend_linux.sh`, `scripts/status_backend_linux.sh`,
  `scripts/update_backend_linux.sh`, `scripts/stop_backend_linux.sh`,
  `apps/server`, `.env.example`, docs, backend integration tests.
- Linked GitHub issue:
  [#40](https://github.com/NeonButrfly/tichuml/issues/40)
- Milestone:
  [Linux Backend Deployment + ML Host](https://github.com/NeonButrfly/tichuml/milestone/25)
- Status:
  Lives in GitHub, not here.

## 2026-04-22 - Runtime control panel config persistence and end-to-end controls

- Prompt signal:
  The backend admin/control panel loses config changes on refresh, renders
  booleans as free text, lacks clear IP override semantics, has a broken git
  panel, and exposes non-working or placeholder controls for backend,
  Postgres, repo update, DB reset, and status refresh.
- Interpreted requirement:
  Issue [#40](https://github.com/NeonButrfly/tichuml/issues/40) also tracks the
  reliability follow-up: `.env` remains the single disk-backed runtime config
  source, but both backend and Linux scripts must parse/escape it structurally
  instead of naïvely shell-sourcing it. The control panel must round-trip config
  changes through guarded APIs with atomic writes, boolean dropdown validation,
  detected-versus-overridden host IP display, real git status/update controls,
  confirmation-gated database reset with migrations, action progress, and
  live status refresh while preserving Ubuntu/Debian and Oracle/RHEL flows.
- Affected systems:
  `apps/server/src/config`, `apps/server/src/services/runtime-admin-service.ts`,
  `apps/server/src/services/runtime-control-panel.ts`,
  `apps/server/src/routes/router.ts`, `scripts/backend-linux-common.sh`,
  `scripts/start_backend_linux.sh`, `scripts/runtime-config.mjs`,
  `scripts/runtime_action_linux.sh`, `.env.example`, docs, backend integration
  tests.
- Linked GitHub issue:
  [#40](https://github.com/NeonButrfly/tichuml/issues/40)
- Milestone:
  [Linux Backend Deployment + ML Host](https://github.com/NeonButrfly/tichuml/milestone/25)
- Status:
  Lives in GitHub, not here.

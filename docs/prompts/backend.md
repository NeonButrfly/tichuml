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
  `scripts/linux/install-backend.sh`, `scripts/linux/backend-common.sh`, `scripts/linux/start-backend.sh`, `scripts/linux/update-backend.sh`, `scripts/linux/status-backend.sh`, `README.md`.
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
  `scripts/linux/force-sync.sh`, `scripts/linux/start-backend.sh`, `packages/engine/src/seat-identity.ts`, `apps/sim-runner/src/self-play-batch.ts`, `apps/server/src/providers/*`, `apps/server/src/routes/router.ts`, tests, docs.
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
  `scripts/linux/install-backend.sh`, `scripts/linux/backend-common.sh`, `scripts/linux/start-backend.sh`, `scripts/linux/update-backend.sh`, `scripts/linux/status-backend.sh`, `scripts/linux/force-sync.sh`, `README.md`.
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
  failures do not kill every game opaquely. Follow-up evidence showed
  `worker_error: "fetch failed"` could also come from telemetry persistence, so
  local/fallback simulation must not depend on telemetry POST success unless a
  strict debugging mode is explicitly enabled.
- Interpreted requirement:
  Issue [#41](https://github.com/NeonButrfly/tichuml/issues/41) tracks full
  `state_raw` pre-send validation for backend decision providers, explicit
  structured logs for payload validation/network/backend-rejection/invalid
  response failures, and a config-driven local heuristic fallback path when
  backend-mode decisions cannot be served safely. It also tracks non-fatal
  telemetry persistence by default, `--strict-telemetry`, `--trace-backend`,
  `TRACE_DECISION_REQUESTS`, additive telemetry failure counters, and compact
  decision trace metadata for future server-side ML debugging.
- Affected systems:
  `apps/sim-runner/src/self-play-batch.ts`,
  `apps/sim-runner/src/cli.ts`,
  `apps/server/src/services/sim-controller-service.ts`,
  `apps/server/src/routes/router.ts`, `apps/server/src/services/decision-service.ts`,
  `apps/server/src/providers/*`, `packages/shared/src/backend.ts`, env examples,
  backend integration tests.
- Linked GitHub issue:
  [#41](https://github.com/NeonButrfly/tichuml/issues/41)
- Milestone:
  [Linux Backend Deployment + ML Host](https://github.com/NeonButrfly/tichuml/milestone/25)
- Status:
  Lives in GitHub, not here.

## 2026-04-22 - Oversized simulator telemetry must not block progress

- Prompt signal:
  A healthy simulator controller/backend run was making decisions but repeatedly
  logging `/api/telemetry/decision` failures with `Request body exceeded the
supported size limit.`, leaving the control UI stuck at `Batches=0`,
  `Games=0`, and `Last batch=running` while `strict_telemetry=false`.
- Interpreted requirement:
  Issue [#41](https://github.com/NeonButrfly/tichuml/issues/41) also tracks the
  telemetry payload compaction follow-up: decision telemetry must default to a
  minimal schema, verbose state dumps must require explicit `telemetry_mode=full`,
  simulator-side payload byte guards must skip oversize telemetry locally, and
  non-strict telemetry failures must be logged/counted without invalidating
  completed game or batch progress. A later follow-up keeps that minimal default
  for routine controller operation while raising configurable backend request
  body limits and simulator post caps so explicit full telemetry can be used for
  training/evaluation/debug runs.
- Affected systems:
  `apps/sim-runner/src/self-play-batch.ts`, `apps/sim-runner/src/cli.ts`,
  `apps/server/src/services/sim-controller-service.ts`,
  `apps/web/src/SimControlDashboard.tsx`, `packages/shared/src/backend.ts`,
  `apps/server/src/config/env.ts`, `apps/server/src/utils/http.ts`,
  `docs/backend-telemetry-runtime.md`, backend/simulator integration tests.
- Linked GitHub issue:
  [#41](https://github.com/NeonButrfly/tichuml/issues/41)
- Milestone:
  [Linux Backend Deployment + ML Host](https://github.com/NeonButrfly/tichuml/milestone/25)
- Status:
  Lives in GitHub, not here.

## 2026-04-22 - Central producer-side telemetry subsystem

- Prompt signal:
  Centralize all telemetry into one authoritative shared pipeline so simulator/selfplay and normal gameplay both feed the same telemetry system, while ensuring telemetry can never blow up gameplay, UI turns, simulator progress, worker shutdown, or controller accounting.
- Interpreted requirement:
  Issue [#35](https://github.com/NeonButrfly/tichuml/issues/35) now covers the producer-side refactor: `packages/telemetry` must own decision/event builders, source tags, normalized config, minimal/full/adaptive policy, byte downgrade/skip behavior, shared POST behavior, non-fatal defaults, strict debug failures, and machine-readable diagnostics. Sim and web code must remain thin adapters only.
- Affected systems:
  `packages/telemetry`, `apps/sim-runner/src/self-play-batch.ts`, `apps/web/src/backend/telemetry.ts`, telemetry tests, telemetry docs.
- Linked GitHub issue:
  [#35](https://github.com/NeonButrfly/tichuml/issues/35)
- Milestone:
  [6.5 - Local ML Integration & Reproducible Backend](https://github.com/NeonButrfly/tichuml/milestone/24)
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
  `apps/server`, `apps/web`, `scripts/linux/backend-common.sh`, simulator
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
  `scripts/linux/backend-common.sh`, `scripts/linux/install-backend.sh`,
  `scripts/linux/start-backend.sh`, `scripts/linux/status-backend.sh`,
  `scripts/linux/update-backend.sh`, `scripts/linux/stop-backend.sh`,
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
  `apps/server/src/routes/router.ts`, `scripts/linux/backend-common.sh`,
  `scripts/linux/start-backend.sh`, `scripts/runtime-config.mjs`,
  `scripts/linux/runtime-action.sh`, `.env.example`, docs, backend integration
  tests.
- Linked GitHub issue:
  [#40](https://github.com/NeonButrfly/tichuml/issues/40)
- Milestone:
  [Linux Backend Deployment + ML Host](https://github.com/NeonButrfly/tichuml/milestone/25)
- Status:
  Lives in GitHub, not here.

## 2026-04-22 - Runtime/admin/controller telemetry final hardening

- Prompt signal:
  Audit the backend/admin/runtime/controller/simulator path end-to-end and fix
  the last sim-run telemetry failure without creating a new telemetry system.
- Interpreted requirement:
  Issues [#35](https://github.com/NeonButrfly/tichuml/issues/35),
  [#40](https://github.com/NeonButrfly/tichuml/issues/40), and
  [#41](https://github.com/NeonButrfly/tichuml/issues/41) cover the final
  hardening: existing shared telemetry stays authoritative; backend telemetry
  ingest validates fast then uses a bounded persistence queue; simulator stop
  must clear stale worker rows; runtime config must persist simulator and
  telemetry defaults; restart-pending and git state must reflect real operator
  states; and telemetry failures must not affect gameplay, simulator batches,
  or controller accounting unless strict telemetry debugging is explicitly
  enabled.
- Affected systems:
  `packages/telemetry`, `apps/server`, `apps/sim-runner`, `apps/web`,
  telemetry/runtime/controller docs, backend integration tests.
- Linked GitHub issues:
  [#35](https://github.com/NeonButrfly/tichuml/issues/35),
  [#40](https://github.com/NeonButrfly/tichuml/issues/40),
  [#41](https://github.com/NeonButrfly/tichuml/issues/41)
- Milestone:
  [Linux Backend Deployment + ML Host](https://github.com/NeonButrfly/tichuml/milestone/25)
  for runtime/controller work and
  [6.5 - Local ML Integration & Reproducible Backend](https://github.com/NeonButrfly/tichuml/milestone/24)
  for telemetry architecture.
- Status:
  Lives in GitHub, not here.

## 2026-04-22 - Simulator telemetry transport failures while controller progresses

- Prompt signal:
  Controller batches and games now increment, but telemetry decision writes still
  repeatedly fail with `network_failure` / `fetch failed` against
  `http://192.168.50.196:4310/api/telemetry/decision`; progress must remain
  non-fatal while telemetry reliability is fixed.
- Interpreted requirement:
  Issue [#41](https://github.com/NeonButrfly/tichuml/issues/41) also tracks the
  transport follow-up: audit the effective backend URL used by runtime/admin UI,
  sim controller, sim-runner, and the shared telemetry client; avoid silently
  posting controller telemetry to a stale or public-only host address; add
  explicit retry/backoff policy; count failures by endpoint and kind; surface
  telemetry transport state in simulator status; and preserve
  `strict_telemetry=false` as non-fatal.
- Affected systems:
  `packages/telemetry`, `packages/shared/src/backend.ts`,
  `apps/server/src/config/env.ts`,
  `apps/server/src/services/runtime-admin-service.ts`,
  `apps/server/src/services/sim-controller-service.ts`,
  `apps/sim-runner/src/cli.ts`,
  `apps/sim-runner/src/self-play-batch.ts`,
  `apps/web/src/SimControlDashboard.tsx`, telemetry/runtime docs, integration
  tests.
- Linked GitHub issue:
  [#41](https://github.com/NeonButrfly/tichuml/issues/41)
- Milestone:
  [Linux Backend Deployment + ML Host](https://github.com/NeonButrfly/tichuml/milestone/25)
- Status:
  Lives in GitHub, not here.

## 2026-04-23 - Admin runtime/controller GUI state drift and telemetry reliability gate

- Prompt signal:
  Patch the current TichuML worktree end to end so telemetry reliability,
  admin/runtime/controller GUI controls, config persistence, Stop behavior,
  restart-pending display, git status mapping, and status panel layout all match
  actual backend/controller state.
- Interpreted requirement:
  Issue [#42](https://github.com/NeonButrfly/tichuml/issues/42) tracks the GUI
  acceptance gate: constrained fields such as provider and telemetry mode must be
  dropdowns, numeric fields must be numeric inputs, booleans must not be free
  text, saved settings must reload from the effective runtime config, Stop must
  clear worker rows idempotently, restart pending must be Yes/No only, git dirty
  or ahead/behind states must not be rendered as healthy-command failures, and
  status panels must stay compact without duplicate status blocks. Issue
  [#41](https://github.com/NeonButrfly/tichuml/issues/41) remains the telemetry
  transport/retry/backoff tracker.
- Affected systems:
  `apps/server/src/services/runtime-admin-service.ts`,
  `apps/server/src/services/runtime-control-panel.ts`,
  `apps/server/src/services/sim-controller-service.ts`,
  `apps/web/src/SimControlDashboard.tsx`, `apps/web/src/styles.css`,
  `packages/telemetry`, runtime/simulator/telemetry docs, integration tests.
- Linked GitHub issues:
  [#41](https://github.com/NeonButrfly/tichuml/issues/41),
  [#42](https://github.com/NeonButrfly/tichuml/issues/42)
- Milestone:
  [Linux Backend Deployment + ML Host](https://github.com/NeonButrfly/tichuml/milestone/25)
- Status:
  Lives in GitHub, not here.

## 2026-04-23 - Simulator dashboard admin API URL drift

- Prompt signal:
  `/admin/sim` and the sim runner dashboard are still not actually working even
  after `/admin/control` fixes.
- Interpreted requirement:
  Issue [#42](https://github.com/NeonButrfly/tichuml/issues/42) also covers the
  simulator dashboard route: the browser admin API base URL must stay separate
  from the controller/sim-runner `backend_url` runtime setting. A remote browser
  served from `https://192.168.50.196:4310/admin/sim` must keep polling
  `https://192.168.50.196:4310/api/admin/sim/*` even when the controller's
  effective backend URL is local-first `http://127.0.0.1:4310`.
- Affected systems:
  `apps/web/src/SimControlDashboard.tsx`, sim dashboard docs, integration tests.
- Linked GitHub issue:
  [#42](https://github.com/NeonButrfly/tichuml/issues/42)
- Milestone:
  [Linux Backend Deployment + ML Host](https://github.com/NeonButrfly/tichuml/milestone/25)
- Status:
  Lives in GitHub, not here.

## 2026-04-23 - Telemetry chosen action must match legal action exactly

- Prompt signal:
  Telemetry client validation is failing because `chosen_action` is not exactly
  one of `legal_actions`.
- Interpreted requirement:
  Issue [#43](https://github.com/NeonButrfly/tichuml/issues/43) tracks the
  producer-side invariant: normal gameplay, simulator/selfplay, controller, and
  fallback decisions must choose telemetry `chosen_action` directly from the same
  actor-scoped legal-action snapshot used for decision generation. Legal actions
  and chosen actions must use the same schema, with no alias drift or extra raw
  engine fields, and validation mismatches must produce a machine-readable
  diagnostic without disabling validation.
- Affected systems:
  `packages/telemetry`, gameplay/selfplay telemetry adapters, simulator
  decision telemetry, telemetry docs, integration tests.
- Linked GitHub issue:
  [#43](https://github.com/NeonButrfly/tichuml/issues/43)
- Milestone:
  [Linux Backend Deployment + ML Host](https://github.com/NeonButrfly/tichuml/milestone/25)
- Status:
  Lives in GitHub, not here.

## 2026-04-23 - Simulator controller stale runtime recovery and run-seed semantics

- Prompt signal:
  Fix the simulator controller stale-state bug completely, and clean up seed
  generation/UI semantics so dead controller sessions do not leave ghost workers
  or a misleading active batch after restart.
- Interpreted requirement:
  Issue [#44](https://github.com/NeonButrfly/tichuml/issues/44) tracks runtime
  reconciliation on backend/controller startup, session-scoped worker rows,
  immediate stale-state rewrites, historical-vs-live run state separation, and
  the clarified seed model: one resolved run seed per simulator run from the
  configured entropy set unless a manual override toggle is explicitly enabled.
- Affected systems:
  `apps/server/src/services/sim-controller-service.ts`,
  `apps/sim-runner/src/cli.ts`, `apps/web/src/SimControlDashboard.tsx`,
  `packages/shared/src/backend.ts`, `scripts/linux/sim-controller.sh`,
  simulator/controller docs, integration tests.
- Linked GitHub issue:
  [#44](https://github.com/NeonButrfly/tichuml/issues/44)
- Milestone:
  [Linux Backend Deployment + ML Host](https://github.com/NeonButrfly/tichuml/milestone/25)
- Status:
  Lives in GitHub, not here.

## 2026-04-23 - Simulator diagnostics harness for provider and telemetry permutations

- Prompt signal:
  Add a simulator diagnostics harness that can run multiple provider and
  telemetry permutations, capture live behavior, and write machine-readable
  artifacts that show slowness, fallback loops, active-seat failures, telemetry
  transport problems, and local-vs-server differences.
- Interpreted requirement:
  Issue [#45](https://github.com/NeonButrfly/tichuml/issues/45) tracks a
  script-first diagnostics workflow around the real sim CLI: quick/full/single
  modes, `server_heuristic` and `local` permutations, controller worker-count
  coverage, live stderr/stdout/runtime parsing, structured counters for
  contract/fallback/telemetry/runtime anomalies, diagnostics-only timing hooks,
  and machine-readable artifact output under `diagnostics/sim-runs/<timestamp>/`.
- Affected systems:
  `apps/sim-runner/src/sim-diagnostics.ts`,
  `scripts/sim-diagnostics.ts`,
  `apps/sim-runner/src/cli.ts`,
  `apps/sim-runner/src/self-play-batch.ts`,
  `packages/telemetry/src/client.ts`,
  diagnostics docs, integration tests.
- Linked GitHub issue:
  [#45](https://github.com/NeonButrfly/tichuml/issues/45)
- Milestone:
  [Linux Backend Deployment + ML Host](https://github.com/NeonButrfly/tichuml/milestone/25)
- Status:
  Lives in GitHub, not here.

## 2026-04-23 - Simulator telemetry select_pass validation and hot-loop slowdown

- Prompt signal:
  Fix simulator telemetry validation and hot-loop slowdown without regressing
  gameplay, stale runtime recovery, seed handling, diagnostics, or controller
  behavior. `select_pass` telemetry was failing because the shared validator was
  comparing a resolved chosen action against template legal-action constraints as
  if they were identical objects, while simulator telemetry POSTs and retries
  still ran directly in the decision loop.
- Interpreted requirement:
  Issues [#41](https://github.com/NeonButrfly/tichuml/issues/41),
  [#43](https://github.com/NeonButrfly/tichuml/issues/43), and
  [#45](https://github.com/NeonButrfly/tichuml/issues/45) cover the follow-up:
  shared telemetry validation must distinguish template legal actions from
  concrete chosen actions, especially for `select_pass`; simulator telemetry
  must move behind a non-blocking background dispatcher so HTTP timeouts,
  retries, and backoff never sit in the decision hot loop; repeated identical
  engine or telemetry diagnostics must be throttled; and diagnostics artifacts
  must explicitly count chosen-action mismatches, telemetry client-validation
  failures, transport failures, and repeated signatures so hot-loop regressions
  are obvious from machine-readable output.
- Affected systems:
  `packages/shared/src/backend.ts`, `packages/telemetry/src/builders.ts`,
  `packages/telemetry/src/client.ts`, `packages/engine/src/engine.ts`,
  `packages/engine/src/logging.ts`, `apps/sim-runner/src/self-play-batch.ts`,
  `apps/sim-runner/src/sim-diagnostics.ts`, telemetry/diagnostics docs, and
  integration tests.
- Linked GitHub issues:
  [#41](https://github.com/NeonButrfly/tichuml/issues/41),
  [#43](https://github.com/NeonButrfly/tichuml/issues/43),
  [#45](https://github.com/NeonButrfly/tichuml/issues/45)
- Milestone:
  [Linux Backend Deployment + ML Host](https://github.com/NeonButrfly/tichuml/milestone/25)
- Status:
  Lives in GitHub, not here.

## 2026-04-23 - Split fast/rich server heuristic decision path for hot-loop recovery

- Prompt signal:
  Fix the `server_heuristic` performance regression without regressing gameplay
  quality, stale-runtime recovery, seed handling, diagnostics, or fallback
  behavior. Restore the old low-latency live backend path by separating a
  bounded fast decision path from the existing rich validation/explainability
  path.
- Interpreted requirement:
  Issue [#46](https://github.com/NeonButrfly/tichuml/issues/46) tracks the
  backend/simulator split-path architecture: live `server_heuristic` decisions
  must default to a compact fast path with actor-scoped legal actions, bounded
  candidate generation, centralized scoring weights, payload and latency
  budgets, request timeout/fallback protection, and no inline rich telemetry or
  explainability work. The rich/full-state path remains available only when
  explicitly enabled for diagnostics or analysis.
- Affected systems:
  `apps/sim-runner/src/self-play-batch.ts`,
  `apps/sim-runner/src/cli.ts`,
  `apps/server/src/providers/*`,
  `apps/server/src/routes/router.ts`,
  `apps/server/src/services/decision-service.ts`,
  `apps/server/src/services/sim-controller-service.ts`,
  `packages/ai-heuristics/src/*`,
  `packages/shared/src/backend.ts`,
  diagnostics artifacts, backend/server heuristic integration tests.
- Linked GitHub issue:
  [#46](https://github.com/NeonButrfly/tichuml/issues/46)
- Milestone:
  [6.5 - Local ML Integration & Reproducible Backend](https://github.com/NeonButrfly/tichuml/milestone/24)
- Status:
  Lives in GitHub, not here.

## 2026-04-26 - Telemetry pipeline resilience with async queue, durable fallback, and replay

- Prompt signal:
  Fix simulator/controller telemetry transport so backend outages, aborted
  requests, and endpoint backoff never make the controller appear dead or stall
  self-play. Add background flushing, durable local fallback, replay, runtime
  telemetry health, and clear timeout/failure classification without regressing
  gameplay, provider selection, server heuristic decisions, controller
  start/stop behavior, or existing admin settings.
- Interpreted requirement:
  Issue [#49](https://github.com/NeonButrfly/tichuml/issues/49) tracks the
  simulator-side resilience path: all live telemetry POSTs must go through one
  shared async client/queue, remote failures must degrade into local NDJSON
  persistence under `.runtime/telemetry/`, telemetry timeout settings must be
  enforced as real deadlines, runtime status and admin UI must show queue and
  endpoint health clearly, and replay must be available through
  `npm run telemetry:replay`.
- Affected systems:
  `packages/telemetry/src/*`,
  `packages/shared/src/backend.ts`,
  `apps/sim-runner/src/self-play-batch.ts`,
  `apps/sim-runner/src/telemetry/*`,
  `apps/sim-runner/src/cli.ts`,
  `apps/server/src/routes/router.ts`,
  `apps/server/src/services/runtime-admin-service.ts`,
  `apps/server/src/services/sim-controller-service.ts`,
  `apps/web/src/SimControlDashboard.tsx`,
  telemetry runtime docs, and integration tests.
- Linked GitHub issue:
  [#49](https://github.com/NeonButrfly/tichuml/issues/49)
- Milestone:
  [6.5 – Local ML Integration & Reproducible Backend](https://github.com/NeonButrfly/tichuml/milestone/24)
- Status:
  Lives in GitHub, not here.

## 2026-04-27 - Repair telemetry persistence truth and Windows one-game diagnostics

- Prompt signal:
  Simulator telemetry, live gameplay telemetry, backend persistence, Windows
  scripts, and diagnostics must work end-to-end the first time. Backend logs
  showed repeated `telemetry_persistence_failed` entries with empty messages
  while `decisions = 0`, `events = 0`, and `matches = 0`; Windows canonical DB
  identity is `tichu-postgres` / `tichu` / port `54329`.
- Interpreted requirement:
  Issue [#50](https://github.com/NeonButrfly/tichuml/issues/50) tracks the
  full-pipeline repair: backend health must expose stale-process and sanitized
  DB identity, telemetry persistence failures must preserve non-empty structured
  Error/Postgres details, queue health must separate accepted/pending/in-flight
  from actual DB row counts, simulator strict telemetry must fail on real
  transport failures, live gameplay must keep posting decision and event
  telemetry through the shared adapters, and Windows scripts must enforce the
  canonical local DB identity and provide a one-game diagnostic ZIP.
- Affected systems:
  `apps/server/src/routes/router.ts`,
  `apps/server/src/services/telemetry-ingest-queue.ts`,
  `apps/server/src/services/telemetry-repository.ts`,
  `apps/server/src/utils/*`,
  `apps/sim-runner/src/self-play-batch.ts`,
  `apps/sim-runner/src/telemetry/async-telemetry.ts`,
  `scripts/sim-doctor.ts`,
  `scripts/*windows*.ps1`,
  `scripts/windows/verify-sim-one-game-fixed.ps1`,
  `packages/shared/src/backend.ts`,
  telemetry/backend docs, and integration tests.
- Linked GitHub issue:
  [#50](https://github.com/NeonButrfly/tichuml/issues/50)
- Milestone:
  [6.5 – Local ML Integration & Reproducible Backend](https://github.com/NeonButrfly/tichuml/milestone/24)
- Status:
  Lives in GitHub, not here.

## 2026-04-27 - Match lifecycle persistence and Linux diagnostic parity

- Prompt signal:
  Decision and event telemetry now persists, but `matches = 0`; implement durable
  simulator match lifecycle persistence and align Linux backend/Postgres/sim
  diagnostics with the Windows script architecture.
- Interpreted requirement:
  Issue [#51](https://github.com/NeonButrfly/tichuml/issues/51) tracks one
  match row per simulator game, stable `match_id`/`game_id`/`hand_id` joins for
  decisions and events, lifecycle event persistence, DB truth validation, Linux
  script parity for backend lifecycle/reset/doctor/one-game diagnostics/training
  runs, and docs that distinguish queue counters from database truth.
- Affected systems:
  `infra/db/migrations`, `apps/server/src/services/telemetry-repository.ts`,
  `apps/sim-runner/src/self-play-batch.ts`, `packages/telemetry`,
  `packages/shared`, `scripts/linux`, `scripts/windows`, telemetry docs, and
  integration tests.
- Linked GitHub issue:
  [#51](https://github.com/NeonButrfly/tichuml/issues/51)
- Milestone:
  [6.5 – Local ML Integration & Reproducible Backend](https://github.com/NeonButrfly/tichuml/milestone/24)
- Status:
  Lives in GitHub, not here.

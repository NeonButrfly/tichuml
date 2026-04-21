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

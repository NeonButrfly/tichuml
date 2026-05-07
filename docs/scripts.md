# Script Layout

Issue [#61](https://github.com/NeonButrfly/tichuml/issues/61) tracks the
current script normalization, training startup, and scoped telemetry workflow.
Issue [#65](https://github.com/NeonButrfly/tichuml/issues/65) tracks the
canonical in-place `clear-db` operator pair.
Issue [#67](https://github.com/NeonButrfly/tichuml/issues/67) tracks the
canonical restoreable `capture-db` operator pair.

Canonical human-runnable scripts live directly under `scripts/`. The only
platform filename difference is the extension: `.ps1` for Windows and `.sh` for
Linux. Shared helpers also live directly under `scripts/`.

Run the sanity checkers after script changes:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\verify-scripts.ps1
```

```bash
scripts/verify-scripts.sh
```

## Canonical Pairs

| Purpose | Windows | Linux |
| --- | --- | --- |
| Backend health | `scripts/backend-health.ps1` | `scripts/backend-health.sh` |
| Backend logs | `scripts/backend-logs.ps1` | `scripts/backend-logs.sh` |
| Bootstrap/install forwarder | `scripts/bootstrap.ps1` | `scripts/bootstrap.sh` |
| Shared helpers | `scripts/common.ps1` | `scripts/common.sh` |
| Capture database snapshot | `scripts/capture-db.ps1` | `scripts/capture-db.sh` |
| Backend helpers | `scripts/backend-common.ps1` | `scripts/backend-common.sh` |
| Clear database data | `scripts/clear-db.ps1` | `scripts/clear-db.sh` |
| Install backend | `scripts/install-backend.ps1` | `scripts/install-backend.sh` |
| Monitor database | `scripts/monitor-db.ps1` | `scripts/monitor-db.sh` |
| Reset database | `scripts/reset-db.ps1` | `scripts/reset-db.sh` |
| Reset local Tichu state | `scripts/reset-tichuml-state.ps1` | `scripts/reset-tichuml-state.sh` |
| Restart backend | `scripts/restart-backend.ps1` | `scripts/restart-backend.sh` |
| Run finite sim | `scripts/run-sim.ps1` | `scripts/run-sim.sh` |
| Continuous training sim loop | `scripts/run-training-sim.ps1` | `scripts/run-training-sim.sh` |
| Script sanity check | `scripts/verify-scripts.ps1` | `scripts/verify-scripts.sh` |
| Sim doctor | `scripts/sim-doctor.ps1` | `scripts/sim-doctor.sh` |
| Start backend | `scripts/start-backend.ps1` | `scripts/start-backend.sh` |
| Start frontend | `scripts/start-frontend.ps1` | `scripts/start-frontend.sh` |
| Start sim controller | `scripts/start-sim-controller.ps1` | `scripts/start-sim-controller.sh` |
| Start training | `scripts/start-training.ps1` | `scripts/start-training.sh` |
| Backend status | `scripts/status-backend.ps1` | `scripts/status-backend.sh` |
| Sim controller status | `scripts/status-sim-controller.ps1` | `scripts/status-sim-controller.sh` |
| Training status | `scripts/status-training.ps1` | `scripts/status-training.sh` |
| Stop backend | `scripts/stop-backend.ps1` | `scripts/stop-backend.sh` |
| Stop sim controller | `scripts/stop-sim-controller.ps1` | `scripts/stop-sim-controller.sh` |
| Stop training | `scripts/stop-training.ps1` | `scripts/stop-training.sh` |
| Update backend | `scripts/update-backend.ps1` | `scripts/update-backend.sh` |
| Validate training run | `scripts/validate-training-run.ps1` | `scripts/validate-training-run.sh` |
| Verify one sim game | `scripts/verify-sim-one-game.ps1` | `scripts/verify-sim-one-game.sh` |

Linux-host-only backend operations currently remain shell-only because they are
called by the Linux runtime control plane: `force-sync.sh`, `runtime-action.sh`,
`sim-controller.sh`, `tail-backend-logs.sh`, `tail-sim-logs.sh`, and
`verify-full-sim-backend.sh`. Windows-only `unblock-scripts.ps1` exists because
Mark-of-the-Web is a Windows concern.

## Help And Safety

Every human-runnable script supports help:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\start-training.ps1 -Help
```

```bash
scripts/start-training.sh --help
```

Destructive scripts refuse to run unless explicitly confirmed. Use
`-Yes`/`-ClearDatabase` on PowerShell and `--yes`/`--clear-database` on shell
where applicable. The canonical `clear-db` pair uses `--yes` on both Windows
and Linux so the destructive confirmation text matches exactly across shells.

`capture-db` is intentionally non-destructive. It reads `DATABASE_URL` from the
current environment when explicitly set, otherwise from the repo-root `.env`,
creates a restoreable custom-format `pg_dump`, writes redacted diagnostics and
git/environment metadata into a staging directory, archives that directory with
7-Zip, prefers the Docker PostgreSQL client when the local dev DB server major
differs from the workstation `pg_dump` major, and warns that active writers may
make the capture non-quiescent.

## Training Startup

`scripts/start-training.ps1` and `scripts/start-training.sh` are the canonical
training start scripts. Both auto-detect repo root, verify required commands,
print the underlying workflow command, and support the core operator options:
games, provider, telemetry strictness, backend URL, seed, run name, output
directory, batch size, and validate-only/dry-run mode.

Examples:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\start-training.ps1 -ValidateOnly -Games 1 -Provider local -AllowUnhealthyBackend -SkipMlExportCheck
```

```bash
scripts/start-training.sh --validate-only --games 1 --provider local --allow-unhealthy-backend --skip-ml-export-check
```

For a finite one-game simulator smoke that does not require backend telemetry:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\run-sim.ps1 -Games 1 -Provider local
```

```bash
scripts/run-sim.sh --games 1 --provider local --telemetry false
```

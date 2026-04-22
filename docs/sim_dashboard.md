# Simulator Dashboard

Tracking issues: [#37](https://github.com/NeonButrfly/tichuml/issues/37),
[#39](https://github.com/NeonButrfly/tichuml/issues/39)

Dashboard routes:

- `/admin/sim`
- `/sim/control`

On the Linux backend host, the server builds `apps/web/dist` and serves these
routes from the same backend origin as the admin API so direct navigation to the
operator URLs does not 404. The Vite asset files under `/assets/*` are also
served by the backend host.

The Linux status/start flow validates both dashboard routes. If either route
returns 404 after a code update, run `scripts/update_backend_linux.sh` on the
host so it force-syncs `origin/main`, rebuilds `apps/web/dist`, and restarts the
backend process. The update/start scripts also replace an unmanaged process that
is listening on the configured backend port without a tracked pid file.

The dashboard is a control surface, not a read-only page. It calls the same
admin controller API used by `scripts/sim-controller.sh`.

Always-visible controls:

- Start
- Pause
- Continue
- Stop
- Run Once
- Refresh

At-a-glance state includes:

- current status and stale heartbeat indicator
- last heartbeat age
- current batch activity
- worker counts
- backend health
- action feedback with prior and current status

Operational sections include:

- editable config for provider, games per batch, telemetry, backend URL, seed
  prefix, sleep seconds, worker count, and confirmation token
- totals for batches, games, errors, and last batch status
- last error
- log path and runtime path
- per-worker table
- recent JSONL log preview
- raw runtime JSON

Mutating buttons are disabled until the confirmation token matches
`CLEAR_TICHU_DB`. The backend still enforces `ENABLE_ADMIN_SIM_CONTROL=true` and
the confirmation header, even if the dashboard is manually edited.

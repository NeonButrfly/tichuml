# Simulator Dashboard

Tracking issues: [#37](https://github.com/NeonButrfly/tichuml/issues/37),
[#39](https://github.com/NeonButrfly/tichuml/issues/39),
[#42](https://github.com/NeonButrfly/tichuml/issues/42)

Dashboard routes:

- `/admin/sim`
- `/sim/control`

On the Linux backend host, the server builds `apps/web/dist` and serves these
routes from the same backend origin as the admin API so direct navigation to the
operator URLs does not 404. The Vite asset files under `/assets/*` are also
served by the backend host.

The Linux status/start flow validates both dashboard routes. If either route
returns 404 after a code update, run `scripts/linux/update-backend.sh` on the
host so it force-syncs `origin/main`, rebuilds `apps/web/dist`, and restarts the
backend process. The update/start scripts also replace an unmanaged process that
is listening on the configured backend port without a tracked pid file.

The dashboard is a control surface, not a read-only page. It calls the same
admin controller API used by `scripts/linux/sim-controller.sh`.

When the dashboard is loaded directly from the backend host on port `4310`, the
default Backend URL is the current browser origin. For example,
`https://192.168.50.196:4310/admin/sim` defaults controller API calls to
`https://192.168.50.196:4310`, not to the browser machine's `localhost`.
After initial default selection the dashboard does not silently rewrite the
Backend URL on network failure; stale or unreachable values remain visible so
operators can fix the effective endpoint instead of unknowingly posting to a
fallback host.

The dashboard intentionally keeps two backend URLs separate:

- Control API base URL: the browser-to-backend origin used for
  `/api/admin/sim/*` and health checks. On the backend-hosted dashboard this is
  the current page origin, such as `https://192.168.50.196:4310`.
- Controller Backend URL: the editable runtime value sent as `backend_url` when
  starting or running the simulator. This is the URL the backend-host controller
  and workers use for decision/telemetry calls, often
  `http://127.0.0.1:4310`.

Status refresh may adopt the effective controller Backend URL returned by the
runtime config, but it must not reuse that value for browser admin API calls.
Otherwise a remote browser can accidentally start polling its own localhost
after the controller reports a local-first backend URL.

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
- telemetry failure totals and active transport backoff
- action feedback with prior and current status

Operational sections include:

- editable config for provider, games per batch, telemetry, backend URL, seed
  prefix, sleep seconds, worker count, and confirmation token
- dropdown controls for provider and telemetry mode, numeric controls for
  counts/timeouts/byte limits, and a checkbox for telemetry enabled
- totals for batches, games, errors, and last batch status
- last error
- telemetry failures by kind and by endpoint
- telemetry backoff deadline, when the shared client is suppressing repeated
  POST attempts to an unreachable endpoint
- log path and runtime path
- per-worker table
- recent JSONL log preview
- raw runtime JSON

Status refresh adopts the effective controller config returned by the backend
until the operator edits the form. This keeps the dashboard aligned with
persisted runtime defaults while preserving unsaved edits during auto-refresh.

Stop responses should move the dashboard to `stopped` with no stale worker rows.
Historical batch/game totals remain in aggregate fields.

Mutating buttons are disabled until the confirmation token matches
`CLEAR_TICHU_DB`. The backend still enforces `ENABLE_ADMIN_SIM_CONTROL=true` and
the confirmation header, even if the dashboard is manually edited.

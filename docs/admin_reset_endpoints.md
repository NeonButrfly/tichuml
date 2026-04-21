# Admin Reset Endpoints

Tracking issue: [#35](https://github.com/NeonButrfly/tichuml/issues/35)

These endpoints are development/admin only and are disabled by default.

## Safeguards

Set:

```bash
ENABLE_DESTRUCTIVE_ADMIN_ENDPOINTS=true
```

Every destructive request must also include either:

```text
x-admin-confirm: CLEAR_TICHU_DB
```

or a JSON body:

```json
{ "confirm": "CLEAR_TICHU_DB" }
```

Requests missing either safeguard return `400` with explicit validation errors.

## Endpoints

`POST /api/admin/telemetry/clear`

Clears telemetry tables only: `decisions` and `events`.

`POST /api/admin/database/clear`

Clears app-owned data tables: `decisions`, `events`, and `matches`. Schema and migration history are retained.

`POST /api/admin/database/reset`

Runs the app-owned clear path and reports reset semantics. Runtime migrations are still applied by normal server startup.

## Response Shape

All destructive endpoints return JSON:

```json
{
  "accepted": true,
  "action": "telemetry.clear",
  "tables_cleared": ["decisions", "events"],
  "row_counts": { "decisions": 12, "events": 48 },
  "warnings": ["Development/admin destructive endpoint used."]
}
```

The server logs row counts whenever a destructive endpoint succeeds.

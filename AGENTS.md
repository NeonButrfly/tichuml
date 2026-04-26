# Repo Notes

## Telemetry Commands

- `npm run sim -- --games 10 --provider local --telemetry true --strict-telemetry false`
- `npm run sim -- --games 10 --provider server_heuristic --telemetry true --strict-telemetry false --backend-url http://127.0.0.1:4310`
- `npm run telemetry:replay`
- `npx tsx apps/sim-runner/src/telemetry/replay.ts`

## Telemetry Troubleshooting

- Live simulator/controller telemetry must stay non-blocking. If runs slow down,
  inspect `apps/sim-runner/src/telemetry/async-telemetry.ts` first and verify
  remote POSTs are still queue-backed instead of running inline with gameplay.
- Check `.runtime/telemetry/pending/` for durable local fallback files when the
  backend is slow, down, or in endpoint backoff.
- Check `.runtime/telemetry/replayed/` after replay to confirm recovery instead
  of silently deleting historical spillover.
- Use `GET /api/telemetry/health` and controller runtime state
  `telemetry_runtime` to verify queue depth, endpoint status, next retry time,
  and the last failure reason.
- Treat `strict_telemetry=true` as a telemetry-debug setting only. Normal sim
  and controller runs should keep `strict_telemetry=false` so remote transport
  failures degrade to local NDJSON persistence instead of failing gameplay.

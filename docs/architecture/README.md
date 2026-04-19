# Architecture Docs

TichuML is organized around a few strict boundaries:

- `packages/engine` is authoritative for legality, phase flow, trick resolution, scoring, and deterministic shuffle behavior.
- `packages/ai-heuristics` is the single canonical deterministic bot brain; it chooses actions from engine-provided legal actions and emits structured explanation output for both the web app and the simulator.
- `packages/telemetry` records append-only decision and event data for replay, debugging, and analysis, and shares stable schema/version constants with the backend ingest path.
- `apps/web` renders phase-aware UI, local interaction, dialogs, and editor tooling without becoming the rules authority.
- `apps/server` owns live entropy collection, Postgres-backed telemetry ingest, replay/read APIs, and server-side heuristic / LightGBM decision routing.
- `apps/web/src/table-layout.ts` is the canonical normal-table geometry schema; components should consume seat/global anchors from it instead of inventing seat-local offsets.

## Runtime Data Flow

1. The web app requests entropy-backed seed generation from the server.
2. The server collects external and local entropy, normalizes the results, and derives a deterministic final seed.
3. The web app starts a new game with that final seed.
4. The engine creates deterministic round state from the seed.
5. Automated decision acquisition flows through one provider abstraction: local heuristics, server heuristics, or the backend LightGBM model with optional client fallback.
6. The backend validates and persists telemetry decisions and events in Postgres, and exposes ordered replay/read endpoints.
7. Heuristic AI, telemetry, and UI all work from engine state instead of inventing parallel legality.

## Stable Invariants

- The engine remains authoritative for rules and transitions.
- The active bot path remains deterministic, legality-filtered, and shared between the web client and the simulator.
- The active bot path remains deterministic, legality-filtered, and shared between the web client and the simulator when `Decision Mode` is `local`.
- Server decision routing may resolve through the shared `heuristics-v1` policy or the LightGBM action model, but backend failure must still preserve playable local fallback.
- The frontend remains phase-aware, not legality-authoritative.
- Backend unavailability must not block gameplay; the local heuristic fallback remains available when enabled.
- Entropy collection happens before a game starts, never during shuffle or mid-round.
- Replay determinism depends on stored seed plus deterministic engine transitions.
- Active Mahjong wishes are hard legality constraints when fulfillable, but the engine must still guarantee at least one legal action for the active seat.
- Human action-row availability should be computed from engine legal actions through one shared helper instead of duplicated button-local conditions.
- Combo response legality must flow from one engine-authoritative pipeline across AI, human UI, and concrete action validation.
- Combination card ids must be normalized through a shared rank-first canonical ordering helper before matching, deduping, or building combination keys.
- Active trick response turns must always resolve to a legal play or a legal pass; optional Tichu handling may not block progression for the current responder.
- UI layout changes must preserve one-screen table fit and no-scroll gameplay.
- Per-seat overlays, trick staging, pickup staging, and pass lanes should derive from the shared table-layout schema so state flows through state -> schema -> render.
- Same-team Tichu / Grand Tichu stacking is forbidden; engine legality and bot scoring should both reject the second call.

## Related Docs

- [../milestones/README.md](../milestones/README.md) for milestone history and naming
- [../telemetry/README.md](../telemetry/README.md) for telemetry and provenance details
- [../ui/README.md](../ui/README.md) for table-layout and dialog constraints
- [../prompts/backend.md](../prompts/backend.md) for backend-foundation prompt capture linked to issue [#30](https://github.com/NeonButrfly/tichuml/issues/30)

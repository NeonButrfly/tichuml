# Architecture Docs

TichuML is organized around a few strict boundaries:

- `packages/engine` is authoritative for legality, phase flow, trick resolution, scoring, and deterministic shuffle behavior.
- `packages/ai-heuristics` chooses actions from engine-provided legal actions and emits structured explanation output.
- `packages/telemetry` records append-only decision and event data for replay, debugging, and analysis.
- `apps/web` renders phase-aware UI, local interaction, dialogs, and editor tooling without becoming the rules authority.
- `apps/server` owns live entropy collection and returns normalized seed-generation results to the client.

## Runtime Data Flow

1. The web app requests entropy-backed seed generation from the server.
2. The server collects external and local entropy, normalizes the results, and derives a deterministic final seed.
3. The web app starts a new game with that final seed.
4. The engine creates deterministic round state from the seed.
5. Heuristic AI, telemetry, and UI all work from engine state instead of inventing parallel legality.

## Stable Invariants

- The engine remains authoritative for rules and transitions.
- The frontend remains phase-aware, not legality-authoritative.
- Entropy collection happens before a game starts, never during shuffle or mid-round.
- Replay determinism depends on stored seed plus deterministic engine transitions.
- Active Mahjong wishes are hard legality constraints when fulfillable, but the engine must still guarantee at least one legal action for the active seat.
- Human action-row availability should be computed from engine legal actions through one shared helper instead of duplicated button-local conditions.
- Combo response legality must flow from one engine-authoritative pipeline across AI, human UI, and concrete action validation.
- Combination card ids must be normalized through a shared rank-first canonical ordering helper before matching, deduping, or building combination keys.
- UI layout changes must preserve one-screen table fit and no-scroll gameplay.

## Related Docs

- [../milestones/README.md](../milestones/README.md) for milestone history and naming
- [../telemetry/README.md](../telemetry/README.md) for telemetry and provenance details
- [../ui/README.md](../ui/README.md) for table-layout and dialog constraints

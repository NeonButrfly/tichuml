# Telemetry Docs

Telemetry remains append-only, versioned, and replay-oriented.

## Current Coverage

- engine decision records
- engine event records
- AI policy names and explanation payloads
- normalized legal-action snapshots
- raw and derived state payloads
- seed provenance and entropy metadata attached to game state
- Postgres-backed `/api/telemetry/decision` and `/api/telemetry/event` ingest on the backend foundation path from issue [#30](https://github.com/NeonButrfly/tichuml/issues/30)

## Backend Storage

The backend foundation stores append-only records in:

- `decisions`
- `events`

The server read path exposes:

- `GET /api/games/:gameId/decisions`
- `GET /api/games/:gameId/events`
- `GET /api/games/:gameId/replay`

`/api/games/:gameId/replay` returns ordered decisions, ordered events, and one combined timeline sorted by timestamp then insertion id.

## Web Runtime Wiring

The web client can now emit backend telemetry for:

- Grand Tichu calls
- Tichu calls
- pass selection
- pass reveal advancement
- pickup / exchange completion
- pass turns
- plays
- engine events produced by those actions, including end-of-hand style events when emitted

Issue [#31](https://github.com/NeonButrfly/tichuml/issues/31) keeps exchange telemetry phase-specific. `pass_select`, `pass_reveal`, and `exchange_complete` remain distinct in persisted replay data instead of being merged into trick play.

Telemetry upload is runtime-configurable in the `Backend Settings` dialog. Disabling telemetry there stops client uploads without requiring rebuilds.

The canonical telemetry contract now lives in [../telemetry_contract.md](../telemetry_contract.md). Development-only clear/reset safeguards are documented in [../admin_reset_endpoints.md](../admin_reset_endpoints.md). Issue [#35](https://github.com/NeonButrfly/tichuml/issues/35) tracks the pipeline alignment across simulator emission, backend ingestion, database storage, ML export, and admin reset behavior.

## Versioning

Current telemetry metadata still exposes milestone-oriented engine and sim version fields where required by the existing schema. Those identifiers remain stable for compatibility even though broader project documentation has moved past the old milestone-only wording.

## Seed And Entropy Provenance

Recent work adds seed provenance alongside gameplay telemetry so that:

- final seed derivation can be audited
- successful and failed entropy sources can be inspected
- deterministic shuffle inputs remain traceable without using live entropy mid-game

Keep stored values bounded:

- show hashes, previews, and normalized metadata
- do not dump giant raw payloads into logs or UI surfaces

## Replay Relationship

Replay safety depends on:

- deterministic engine transitions
- stored seed/final shuffle inputs
- append-only telemetry

Use integration tests for replay-adjacent verification until dedicated replay suites are expanded further.

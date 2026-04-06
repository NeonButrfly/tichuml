# Telemetry Docs

Telemetry remains append-only, versioned, and replay-oriented.

## Current Coverage

- engine decision records
- engine event records
- AI policy names and explanation payloads
- normalized legal-action snapshots
- raw and derived state payloads
- seed provenance and entropy metadata attached to game state

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

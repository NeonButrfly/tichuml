# Canonical Telemetry Contract

Tracking issue: [#35](https://github.com/NeonButrfly/tichuml/issues/35)

## Ingestion

Decision telemetry is ingested at `POST /api/telemetry/decision`. Event telemetry is ingested at `POST /api/telemetry/event`. Both routes validate payload shape before storage and reject malformed payloads with `accepted: false` plus `validation_errors`.

## Decision Payload

Required canonical decision fields:

- `game_id`, `hand_id`, `ts`
- `phase`, `actor_seat`, `decision_index`
- `schema_version`, `engine_version`, `sim_version`
- `requested_provider`, `provider_used`, `fallback_used`
- `policy_name`, `policy_source`
- `state_raw`, `state_norm`
- actor-scoped `legal_actions`
- `chosen_action`
- `metadata`

Rich optional fields are preserved when available:

- `explanation`
- `candidateScores`
- `stateFeatures`
- `antipattern_tags`

Consistency checks:

- `chosen_action` must match one of `actor_seat`'s legal actions.
- `phase` must match `state_raw.phase` when present.
- `actor_seat` must match `state_raw.activeSeat` when a seat actor is active.
- `legal_actions` must be an actor-scoped array or a map containing `actor_seat`.

## Event Payload

Required canonical event fields:

- `game_id`, `hand_id`, `ts`
- `phase`, `event_type`, `event_index`
- `actor_seat` when derivable, otherwise `null`
- `schema_version`, `engine_version`, `sim_version`
- provider context when meaningful: `requested_provider`, `provider_used`, `fallback_used`
- `state_norm` snapshot when available
- raw `payload`
- `metadata`

## Stored Fields

The database keeps raw JSONB for:

- `state_raw`
- `state_norm`
- `legal_actions`
- `chosen_action`
- `metadata`
- event `payload`
- rich decision `explanation`, `candidate_scores`, `state_features`

It also stores query-friendly scalar fields:

- provider context
- decision/event indexes
- `chosen_action_type`
- `legal_action_count`
- explanation/candidate/state feature flags
- wish/pass helpers
- `state_hash`, `legal_actions_hash`, `chosen_action_hash`, `event_hash`

Views:

- `telemetry_decision_counts_by_phase_provider`
- `telemetry_event_counts_by_type_phase`
- `telemetry_training_readiness_stats`

## ML Export

`ml/export_training_rows.py` reads decisions as the canonical ML source. It prefers canonical rich columns and falls back to legacy metadata paths for explanation, `candidateScores`, and `stateFeatures`.

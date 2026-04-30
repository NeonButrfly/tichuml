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

`/api/games/:gameId/replay` returns ordered decisions, ordered events, and one
combined timeline. Decision reads are ordered by `game_id`, `hand_id`,
`decision_index`, `ts`, then `id`; event reads are ordered by `game_id`,
`hand_id`, `event_index`, `ts`, then `id`. Replay, training export, validation,
and analysis code must not rely on raw table/export row order.

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

## Authoritative Telemetry Package

`packages/telemetry` is the authoritative producer-side telemetry subsystem. It owns:

- payload builders for decision and event telemetry
- source adapters for gameplay, selfplay, controller, and eval producers
- source tags stored in metadata as `source` and `telemetry_source`
- canonical `chosen_action` selection from the same actor-scoped `legal_actions`
  snapshot used for validation
- normalized telemetry config for enabled/strict/trace/mode/max-byte/backend settings
- minimal/full/adaptive policy selection
- byte measurement, downgrade, and skip behavior
- shared POST behavior for `/api/telemetry/decision` and `/api/telemetry/event`
- POST timeout, retry, and endpoint backoff behavior
- non-fatal failure results, strict-mode errors, and structured diagnostics

Existing producers are intentionally thin:

- normal gameplay uses `apps/web/src/backend/telemetry.ts` as a UI adapter into `@tichuml/telemetry`
- simulator/selfplay uses `apps/sim-runner/src/self-play-batch.ts` as a gameplay-context adapter into `@tichuml/telemetry`
- controller selfplay uses the same selfplay adapter with `source: "controller"` and worker metadata

Do not add new telemetry builders or raw telemetry POST paths in application code. Future producers should add a thin source adapter in `packages/telemetry/src/source-adapters.ts` or call the existing shared builders/client directly.

Decision telemetry must keep `chosen_action` structurally identical to one entry
in the actor's `legal_actions`. The shared builder enforces that by selecting
the canonical legal action object from the actor-scoped list after source
adapters serialize actions. Callers must pass the legal actions from the exact
state used to choose the action; fallback decisions use the same rule. If a
payload still fails local validation because `chosen_action` is not legal, the
shared client logs a machine-readable `telemetry_chosen_action_mismatch`
diagnostic with the state identifiers, full `chosen_action`, and full
`legal_actions`, then follows the configured non-strict or strict failure
policy.

Template-like legal actions are validated as templates, not as fully materialized
concrete actions. `select_pass` is the current example: legal actions expose
`availableCardIds` plus `requiredTargets`, while the chosen action records the
resolved `left` / `partner` / `right` selection. Shared validation now treats a
`select_pass` choice as legal when it satisfies the template constraints for the
same seat instead of requiring object equality against the template.

Provider names are normalized before fallback detection. `local`, UI local
heuristic labels, and `local_heuristic` are equivalent aliases. `fallback_used`
is true only when a requested provider actually failed or was unavailable and a
different provider handled the decision. Normal local heuristic use must not be
counted as fallback.

Wish telemetry uses authoritative game state. Decision metadata and
`stateFeatures` include `current_wish` / `wish_rank`, `wish_owner` /
`wish_source` when inferable from the Mahjong play in the current trick,
`actor_holds_fulfilling_wish_card`, `legal_fulfilling_wish_move_count`,
`legal_fulfilling_wish_moves_exist`, `wish_fulfillment_required`,
`chosen_action_fulfilled_wish`, and
`chosen_action_failed_required_wish`. When no wish exists the same fields stay
explicitly null/false. Event telemetry carries the active wish rank from
`state_norm` in metadata so event counts can be audited without full state.

Mahjong wish strategy telemetry distinguishes the action that created or skipped
a wish from later active-wish enforcement. When Mahjong is played, decision
metadata and `stateFeatures` include `mahjong_played`,
`mahjong_wish_available`, `mahjong_wish_selected`,
`mahjong_wish_skipped_reason`, `wish_reason`, `wish_target_seat`,
`wish_target_team`, `wish_rank_source_card_id`,
`wish_rank_source_target`, `wish_considered_tichu_pressure`, and
`wish_considered_grand_tichu_pressure`. Heuristic explanations also carry
`selectedMahjongWish` and per-candidate `mahjongWish` metadata. No-wish Mahjong
remains legal when the engine accepts it; heuristic skips must use stable
enum-like reasons such as `rules_variant_allows_no_wish`, and normal heuristic
runs should usually select a wish when `availableWishRanks` is non-empty.

Candidate scores are recorded as `expanded_candidate_actions`. They may be an
expanded or filtered candidate set rather than a one-to-one copy of compact
legal actions. Metadata records `compact_legal_action_count`,
`scored_candidate_count`, `chosen_action_has_scored_candidate`, and
`chosen_action_unscored_reason` so mismatches are explicit.

## Failure Policy

Telemetry is best-effort by default. With `strictTelemetry=false`, telemetry upload, validation, backend, network, and oversize failures return structured results and diagnostics without throwing into gameplay, UI turns, selfplay decisions, controller loops, or worker shutdown. `strictTelemetry=true` is reserved for targeted debugging and may surface a `TelemetryError`.

Oversize handling is centralized:

- minimal payloads are preferred for routine simulator/controller operation
- full payloads preserve rich training data when explicitly requested
- full payloads downgrade to minimal when the configured byte cap is exceeded
- payloads that still exceed the cap are skipped locally and logged as machine-readable diagnostics

Backend ingest validates synchronously, then persists through a bounded queue.
Queue pressure and persistence failures are logged as machine-readable backend
diagnostics and exposed through `/api/telemetry/health` queue stats; they do not
make non-strict gameplay or self-play fail.

Transport failures are counted by endpoint and by failure kind. After a network
failure, the shared client backs off that endpoint and returns
`backoff_suppressed` results until the backoff window expires instead of posting
every decision into the same unreachable route. Simulator/controller runtime
state surfaces these counters and the active backoff deadline.

The simulator path keeps telemetry off the decision hot loop. Self-play batches
schedule decision and event telemetry onto an async queue manager, continue
gameplay immediately, then flush only briefly at batch/game boundaries. Remote
telemetry POST failures spool NDJSON records under `.runtime/telemetry/pending/`
for later replay instead of stalling game completion, batch completion,
controller accounting, or worker shutdown.

Issue [#49](https://github.com/NeonButrfly/tichuml/issues/49) extends the
simulator-side transport path with:

- background-only remote POSTs for live sim/controller runs
- per-endpoint runtime status: `connected`, `degraded`, `backoff`, `offline`
- queue-depth, accepted, failed, dropped, and pending counters
- last success/failure timestamps and the most recent failure reason
- durable local fallback files in `.runtime/telemetry/pending/`
- replay support through `npm run telemetry:replay`

Replay moves successfully resent files into `.runtime/telemetry/replayed/` so
operators can distinguish still-pending telemetry from already recovered local
spillover.

## Sanity And Deterministic Export

Run the telemetry sanity checker against the same database the backend uses:

```powershell
npm run telemetry:sanity -- --backend-url http://127.0.0.1:4310
```

For direct DB use:

```powershell
npm run telemetry:sanity -- --database-url "$env:DATABASE_URL" --json-output diagnostics/telemetry-sanity.json
```

The command prints a human summary and a JSON summary with match, completed
match, decision, and event counts; provider mismatch and false-fallback
suspicion counts; active wish decision/event counts; Mahjong played/with-wish/
without-wish/available-but-skipped counts; skipped-reason and `wish_reason`
breakdowns; required-wish fulfillment and violation counts; Tichu/Grand Tichu
wish-pressure counts; legal chosen-action and `select_pass` semantic pass rates;
candidate-score coverage; event ordering problems; JSON parse errors; and a
training-readiness verdict.

Use deterministic exports for offline analysis:

```bash
psql "$DATABASE_URL" -c "\copy (SELECT * FROM matches ORDER BY game_id ASC, COALESCE(completed_at, updated_at, started_at, created_at) ASC, id ASC) TO 'matches.csv' WITH CSV HEADER"
psql "$DATABASE_URL" -c "\copy (SELECT * FROM decisions ORDER BY game_id ASC, hand_id ASC, decision_index ASC, ts ASC, id ASC) TO 'decisions.csv' WITH CSV HEADER"
psql "$DATABASE_URL" -c "\copy (SELECT * FROM events ORDER BY game_id ASC, hand_id ASC, event_index ASC, ts ASC, id ASC) TO 'events.csv' WITH CSV HEADER"
```

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

## Diagnostics

Canonical verifier entrypoints live under the platform folders:

- Windows one-game diagnostic:
  `powershell -ExecutionPolicy Bypass -File scripts\windows\verify-sim-one-game-fixed.ps1 -ClearDatabase`
- Linux one-game diagnostic:
  `./scripts/linux/verify-sim-one-game-fixed.sh --clear-database --timeout-seconds 90`
- Linux full backend/simulator verification:
  `./scripts/linux/verify-full-sim-backend.sh --clear-database --games 100 --provider local --telemetry-mode minimal`

Top-level script paths under `scripts/` remain compatibility wrappers only.

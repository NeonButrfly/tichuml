WITH ranked_decisions AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY game_id, decision_index
      ORDER BY ts ASC, id ASC
    ) AS duplicate_rank
  FROM decisions
  WHERE game_id <> 'legacy'
)
DELETE FROM decisions
WHERE id IN (
  SELECT id
  FROM ranked_decisions
  WHERE duplicate_rank > 1
);

WITH ranked_events AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY game_id, event_index
      ORDER BY ts ASC, id ASC
    ) AS duplicate_rank
  FROM events
  WHERE game_id <> 'legacy'
)
DELETE FROM events
WHERE id IN (
  SELECT id
  FROM ranked_events
  WHERE duplicate_rank > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS decisions_game_id_decision_index_uidx
  ON decisions(game_id, decision_index)
  WHERE game_id <> 'legacy';

CREATE UNIQUE INDEX IF NOT EXISTS events_game_id_event_index_uidx
  ON events(game_id, event_index)
  WHERE game_id <> 'legacy';

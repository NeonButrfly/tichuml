ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS game_id TEXT,
  ADD COLUMN IF NOT EXISTS last_hand_id TEXT,
  ADD COLUMN IF NOT EXISTS provider TEXT,
  ADD COLUMN IF NOT EXISTS requested_provider TEXT,
  ADD COLUMN IF NOT EXISTS telemetry_mode TEXT,
  ADD COLUMN IF NOT EXISTS strict_telemetry BOOLEAN,
  ADD COLUMN IF NOT EXISTS sim_version TEXT,
  ADD COLUMN IF NOT EXISTS engine_version TEXT,
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE matches
SET started_at = COALESCE(started_at, created_at),
    updated_at = COALESCE(updated_at, created_at)
WHERE started_at IS NULL
   OR updated_at IS NULL;

ALTER TABLE decisions
  ADD COLUMN IF NOT EXISTS match_id UUID REFERENCES matches(id) ON DELETE SET NULL;

ALTER TABLE events
  ALTER COLUMN match_id DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS matches_game_id_uidx ON matches(game_id) WHERE game_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS matches_status_idx ON matches(status);
CREATE INDEX IF NOT EXISTS matches_started_at_idx ON matches(started_at);
CREATE INDEX IF NOT EXISTS matches_completed_at_idx ON matches(completed_at);
CREATE INDEX IF NOT EXISTS decisions_match_id_idx ON decisions(match_id);
CREATE INDEX IF NOT EXISTS events_match_id_idx ON events(match_id);

INSERT INTO matches (
  game_id,
  last_hand_id,
  provider,
  requested_provider,
  telemetry_mode,
  strict_telemetry,
  sim_version,
  engine_version,
  started_at,
  completed_at,
  status,
  updated_at
)
SELECT
  source.game_id,
  source.last_hand_id,
  source.provider,
  source.requested_provider,
  source.telemetry_mode,
  source.strict_telemetry,
  source.sim_version,
  source.engine_version,
  source.started_at,
  source.completed_at,
  CASE WHEN source.completed_at IS NULL THEN 'running' ELSE 'completed' END,
  NOW()
FROM (
  SELECT
    game_id,
    (ARRAY_AGG(hand_id ORDER BY ts DESC))[1] AS last_hand_id,
    (ARRAY_AGG(provider_used ORDER BY ts DESC))[1] AS provider,
    (ARRAY_AGG(requested_provider ORDER BY ts DESC))[1] AS requested_provider,
    (ARRAY_AGG(metadata->>'telemetry_mode' ORDER BY ts DESC))[1] AS telemetry_mode,
    BOOL_OR((metadata->>'strict_telemetry')::BOOLEAN) FILTER (WHERE metadata ? 'strict_telemetry') AS strict_telemetry,
    (ARRAY_AGG(sim_version ORDER BY ts DESC))[1] AS sim_version,
    (ARRAY_AGG(engine_version ORDER BY ts DESC))[1] AS engine_version,
    MIN(ts) AS started_at,
    MAX(ts) FILTER (WHERE phase = 'finished') AS completed_at
  FROM (
    SELECT game_id, hand_id, ts, phase, provider_used, requested_provider, metadata, sim_version, engine_version
    FROM decisions
    UNION ALL
    SELECT game_id, hand_id, ts, phase, provider_used, requested_provider, metadata, sim_version, engine_version
    FROM events
  ) telemetry
  WHERE game_id IS NOT NULL
  GROUP BY game_id
) source
ON CONFLICT (game_id) WHERE game_id IS NOT NULL DO NOTHING;

UPDATE decisions
SET match_id = matches.id
FROM matches
WHERE decisions.match_id IS NULL
  AND matches.game_id = decisions.game_id;

UPDATE events
SET match_id = matches.id
FROM matches
WHERE events.match_id IS NULL
  AND matches.game_id = events.game_id;

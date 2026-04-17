CREATE TABLE IF NOT EXISTS decisions (
  id BIGSERIAL PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  game_id TEXT NOT NULL,
  hand_id TEXT NOT NULL,
  phase TEXT NOT NULL,
  actor_seat TEXT NOT NULL,
  decision_index INTEGER NOT NULL,
  schema_version INTEGER NOT NULL,
  engine_version TEXT NOT NULL,
  sim_version TEXT NOT NULL,
  policy_name TEXT NOT NULL,
  policy_source TEXT NOT NULL,
  state_raw JSONB NOT NULL,
  state_norm JSONB,
  legal_actions JSONB NOT NULL,
  chosen_action JSONB NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  antipattern_tags JSONB NOT NULL DEFAULT '[]'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS game_id TEXT NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS hand_id TEXT NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS phase TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS actor_seat TEXT,
  ADD COLUMN IF NOT EXISTS schema_version INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS engine_version TEXT NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS sim_version TEXT NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::JSONB;

CREATE INDEX IF NOT EXISTS decisions_game_id_idx ON decisions(game_id);
CREATE INDEX IF NOT EXISTS decisions_hand_id_idx ON decisions(hand_id);
CREATE INDEX IF NOT EXISTS decisions_phase_idx ON decisions(phase);
CREATE INDEX IF NOT EXISTS decisions_policy_name_idx ON decisions(policy_name);

CREATE INDEX IF NOT EXISTS events_game_id_idx ON events(game_id);
CREATE INDEX IF NOT EXISTS events_hand_id_idx ON events(hand_id);
CREATE INDEX IF NOT EXISTS events_phase_idx ON events(phase);

ALTER TABLE decisions
  ADD COLUMN IF NOT EXISTS trick_id TEXT,
  ADD COLUMN IF NOT EXISTS trick_index INTEGER,
  ADD COLUMN IF NOT EXISTS hand_index INTEGER,
  ADD COLUMN IF NOT EXISTS game_index INTEGER,
  ADD COLUMN IF NOT EXISTS actor_team TEXT,
  ADD COLUMN IF NOT EXISTS trick_winner_seat TEXT,
  ADD COLUMN IF NOT EXISTS trick_winner_team TEXT,
  ADD COLUMN IF NOT EXISTS trick_points INTEGER,
  ADD COLUMN IF NOT EXISTS actor_team_won_trick BOOLEAN,
  ADD COLUMN IF NOT EXISTS hand_ns_score_delta INTEGER,
  ADD COLUMN IF NOT EXISTS hand_ew_score_delta INTEGER,
  ADD COLUMN IF NOT EXISTS actor_team_hand_score_delta INTEGER,
  ADD COLUMN IF NOT EXISTS actor_team_won_hand BOOLEAN,
  ADD COLUMN IF NOT EXISTS game_ns_final_score INTEGER,
  ADD COLUMN IF NOT EXISTS game_ew_final_score INTEGER,
  ADD COLUMN IF NOT EXISTS actor_team_won_game BOOLEAN,
  ADD COLUMN IF NOT EXISTS final_hand_winner_team TEXT,
  ADD COLUMN IF NOT EXISTS final_game_winner_team TEXT,
  ADD COLUMN IF NOT EXISTS hand_result JSONB,
  ADD COLUMN IF NOT EXISTS game_result JSONB,
  ADD COLUMN IF NOT EXISTS outcome_reward NUMERIC,
  ADD COLUMN IF NOT EXISTS outcome_components JSONB,
  ADD COLUMN IF NOT EXISTS outcome_version TEXT;

CREATE INDEX IF NOT EXISTS decisions_trick_id_idx ON decisions(trick_id);
CREATE INDEX IF NOT EXISTS decisions_trick_index_idx ON decisions(trick_index);
CREATE INDEX IF NOT EXISTS decisions_hand_index_idx ON decisions(hand_index);
CREATE INDEX IF NOT EXISTS decisions_game_index_idx ON decisions(game_index);
CREATE INDEX IF NOT EXISTS decisions_actor_team_idx ON decisions(actor_team);
CREATE INDEX IF NOT EXISTS decisions_outcome_reward_idx ON decisions(outcome_reward);

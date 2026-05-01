ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS final_team_0_score INTEGER,
  ADD COLUMN IF NOT EXISTS final_team_1_score INTEGER,
  ADD COLUMN IF NOT EXISTS winner_team TEXT,
  ADD COLUMN IF NOT EXISTS hands_played INTEGER,
  ADD COLUMN IF NOT EXISTS failure_reason TEXT;

CREATE INDEX IF NOT EXISTS matches_winner_team_idx ON matches(winner_team);

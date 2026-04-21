ALTER TABLE decisions
  ADD COLUMN IF NOT EXISTS requested_provider TEXT,
  ADD COLUMN IF NOT EXISTS provider_used TEXT,
  ADD COLUMN IF NOT EXISTS fallback_used BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS explanation JSONB,
  ADD COLUMN IF NOT EXISTS candidate_scores JSONB,
  ADD COLUMN IF NOT EXISTS state_features JSONB,
  ADD COLUMN IF NOT EXISTS chosen_action_type TEXT,
  ADD COLUMN IF NOT EXISTS legal_action_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS has_explanation BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS has_candidate_scores BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS has_state_features BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS has_wish BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS wish_rank INTEGER,
  ADD COLUMN IF NOT EXISTS can_pass BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS state_hash TEXT,
  ADD COLUMN IF NOT EXISTS legal_actions_hash TEXT,
  ADD COLUMN IF NOT EXISTS chosen_action_hash TEXT;

UPDATE decisions
SET
  requested_provider = COALESCE(requested_provider, metadata->>'requested_provider', policy_source),
  provider_used = COALESCE(provider_used, metadata->>'provider_used', policy_source),
  explanation = COALESCE(explanation, metadata->'explanation', metadata->'policy_explanation'),
  candidate_scores = COALESCE(candidate_scores, metadata->'explanation'->'candidateScores', metadata->'policy_explanation'->'candidateScores'),
  state_features = COALESCE(state_features, metadata->'explanation'->'stateFeatures', metadata->'policy_explanation'->'stateFeatures'),
  chosen_action_type = COALESCE(chosen_action_type, chosen_action->>'type'),
  has_explanation = COALESCE(explanation, metadata->'explanation', metadata->'policy_explanation') IS NOT NULL,
  has_candidate_scores = COALESCE(candidate_scores, metadata->'explanation'->'candidateScores', metadata->'policy_explanation'->'candidateScores') IS NOT NULL,
  has_state_features = COALESCE(state_features, metadata->'explanation'->'stateFeatures', metadata->'policy_explanation'->'stateFeatures') IS NOT NULL,
  has_wish = chosen_action ? 'wishRank',
  wish_rank = CASE
    WHEN jsonb_typeof(chosen_action->'wishRank') = 'number' THEN (chosen_action->>'wishRank')::INTEGER
    ELSE wish_rank
  END
WHERE requested_provider IS NULL
  OR provider_used IS NULL
  OR explanation IS NULL
  OR candidate_scores IS NULL
  OR state_features IS NULL
  OR chosen_action_type IS NULL;

ALTER TABLE decisions
  ALTER COLUMN requested_provider SET NOT NULL,
  ALTER COLUMN provider_used SET NOT NULL;

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS event_index INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS requested_provider TEXT,
  ADD COLUMN IF NOT EXISTS provider_used TEXT,
  ADD COLUMN IF NOT EXISTS fallback_used BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS state_norm JSONB,
  ADD COLUMN IF NOT EXISTS state_hash TEXT,
  ADD COLUMN IF NOT EXISTS event_hash TEXT;

UPDATE events
SET
  event_index = COALESCE(event_index, (metadata->>'event_index')::INTEGER, 0),
  requested_provider = COALESCE(requested_provider, metadata->>'requested_provider'),
  provider_used = COALESCE(provider_used, metadata->>'provider_used'),
  state_norm = COALESCE(state_norm, payload->'state_norm')
WHERE event_index IS NULL
  OR requested_provider IS NULL
  OR provider_used IS NULL
  OR state_norm IS NULL;

CREATE INDEX IF NOT EXISTS decisions_ts_idx ON decisions(ts);
CREATE INDEX IF NOT EXISTS decisions_actor_seat_idx ON decisions(actor_seat);
CREATE INDEX IF NOT EXISTS decisions_policy_source_idx ON decisions(policy_source);
CREATE INDEX IF NOT EXISTS decisions_provider_used_idx ON decisions(provider_used);
CREATE INDEX IF NOT EXISTS decisions_decision_index_idx ON decisions(decision_index);
CREATE INDEX IF NOT EXISTS decisions_state_hash_idx ON decisions(state_hash);
CREATE INDEX IF NOT EXISTS decisions_chosen_action_type_idx ON decisions(chosen_action_type);

CREATE INDEX IF NOT EXISTS events_ts_idx ON events(ts);
CREATE INDEX IF NOT EXISTS events_event_type_idx ON events(event_type);
CREATE INDEX IF NOT EXISTS events_actor_seat_idx ON events(actor_seat);
CREATE INDEX IF NOT EXISTS events_event_index_idx ON events(event_index);
CREATE INDEX IF NOT EXISTS events_state_hash_idx ON events(state_hash);

CREATE OR REPLACE VIEW telemetry_decision_counts_by_phase_provider AS
SELECT
  phase,
  provider_used,
  COUNT(*)::INTEGER AS decision_count
FROM decisions
GROUP BY phase, provider_used;

CREATE OR REPLACE VIEW telemetry_event_counts_by_type_phase AS
SELECT
  event_type,
  phase,
  COUNT(*)::INTEGER AS event_count
FROM events
GROUP BY event_type, phase;

CREATE OR REPLACE VIEW telemetry_training_readiness_stats AS
SELECT
  COUNT(*)::INTEGER AS decisions,
  COUNT(*) FILTER (WHERE legal_action_count > 0)::INTEGER AS decisions_with_legal_actions,
  COUNT(*) FILTER (WHERE has_explanation)::INTEGER AS decisions_with_explanation,
  COUNT(*) FILTER (WHERE has_candidate_scores)::INTEGER AS decisions_with_candidate_scores,
  COUNT(*) FILTER (WHERE has_state_features)::INTEGER AS decisions_with_state_features,
  COUNT(*) FILTER (WHERE chosen_action_hash IS NOT NULL)::INTEGER AS decisions_with_chosen_action_hash
FROM decisions;

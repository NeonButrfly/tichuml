ALTER TABLE decisions
  ADD COLUMN IF NOT EXISTS worker_id TEXT;

UPDATE decisions
SET worker_id = COALESCE(worker_id, metadata->>'worker_id')
WHERE worker_id IS NULL
  AND metadata ? 'worker_id';

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS worker_id TEXT;

UPDATE events
SET worker_id = COALESCE(worker_id, metadata->>'worker_id')
WHERE worker_id IS NULL
  AND metadata ? 'worker_id';

CREATE INDEX IF NOT EXISTS decisions_worker_id_idx ON decisions(worker_id);
CREATE INDEX IF NOT EXISTS events_worker_id_idx ON events(worker_id);

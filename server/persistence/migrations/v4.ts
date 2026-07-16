export const v4Sql = `
CREATE TABLE runtime_events (
  id TEXT PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 255),
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  run_id TEXT,
  sequence INTEGER NOT NULL CHECK (sequence >= 0),
  type TEXT NOT NULL CHECK (length(type) BETWEEN 1 AND 64),
  lane TEXT NOT NULL CHECK (length(lane) BETWEEN 1 AND 32),
  status TEXT,
  label TEXT,
  content TEXT,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  created_at TEXT NOT NULL,
  previous_hash TEXT NOT NULL CHECK (length(previous_hash) BETWEEN 1 AND 128),
  event_hash TEXT NOT NULL CHECK (length(event_hash) BETWEEN 1 AND 128),
  UNIQUE (conversation_id, sequence),
  UNIQUE (conversation_id, event_hash)
) STRICT;

CREATE INDEX runtime_events_conversation_sequence_idx
  ON runtime_events(conversation_id, sequence);
CREATE INDEX runtime_events_conversation_run_idx
  ON runtime_events(conversation_id, run_id, sequence);
`

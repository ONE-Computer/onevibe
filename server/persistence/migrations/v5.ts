export const v5Sql = `
CREATE TABLE native_events (
  id TEXT PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 255),
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL CHECK (length(run_id) BETWEEN 1 AND 255),
  source TEXT NOT NULL CHECK (length(source) BETWEEN 1 AND 64),
  source_event_id TEXT NOT NULL CHECK (length(source_event_id) BETWEEN 1 AND 512),
  source_sequence INTEGER NOT NULL CHECK (source_sequence >= 0),
  native_type TEXT NOT NULL CHECK (length(native_type) BETWEEN 1 AND 128),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  payload_hash TEXT NOT NULL CHECK (length(payload_hash) = 64),
  received_at TEXT NOT NULL,
  UNIQUE (conversation_id, run_id, source, source_event_id),
  UNIQUE (conversation_id, run_id, source, source_sequence)
) STRICT;

CREATE INDEX native_events_conversation_sequence_idx
  ON native_events(conversation_id, source_sequence);
CREATE INDEX native_events_run_sequence_idx
  ON native_events(conversation_id, run_id, source, source_sequence);

CREATE TABLE native_event_projections (
  native_event_id TEXT NOT NULL REFERENCES native_events(id) ON DELETE CASCADE,
  projection_index INTEGER NOT NULL CHECK (projection_index >= 0),
  runtime_event_id TEXT NOT NULL REFERENCES runtime_events(id) ON DELETE CASCADE,
  projector_version INTEGER NOT NULL CHECK (projector_version > 0),
  projected_at TEXT NOT NULL,
  PRIMARY KEY (native_event_id, projection_index),
  UNIQUE (runtime_event_id)
) STRICT;

CREATE TABLE native_projection_offsets (
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL CHECK (length(run_id) BETWEEN 1 AND 255),
  source TEXT NOT NULL CHECK (length(source) BETWEEN 1 AND 64),
  projector_version INTEGER NOT NULL CHECK (projector_version > 0),
  last_source_sequence INTEGER NOT NULL CHECK (last_source_sequence >= -1),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (conversation_id, run_id, source, projector_version)
) STRICT;
`

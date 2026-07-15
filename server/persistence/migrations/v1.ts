export const v1Sql = `
CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY CHECK (version > 0),
  name TEXT NOT NULL,
  checksum TEXT NOT NULL CHECK (length(checksum) = 64),
  applied_at TEXT NOT NULL
) STRICT;

CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  title TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deleted')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (updated_at >= created_at)
) STRICT;
CREATE INDEX conversations_status_updated_idx ON conversations(status, updated_at DESC);

CREATE TABLE turns (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  client_request_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  created_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  error_json TEXT,
  UNIQUE (conversation_id, ordinal),
  UNIQUE (conversation_id, client_request_id),
  CHECK (started_at IS NULL OR started_at >= created_at),
  CHECK (completed_at IS NULL OR started_at IS NOT NULL),
  CHECK (completed_at IS NULL OR completed_at >= started_at)
) STRICT;
CREATE UNIQUE INDEX turns_one_active_per_conversation_idx
  ON turns(conversation_id) WHERE status IN ('queued', 'running');
CREATE INDEX turns_conversation_created_idx ON turns(conversation_id, created_at);

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  turn_id TEXT REFERENCES turns(id) ON DELETE SET NULL,
  sequence INTEGER NOT NULL CHECK (sequence >= 0),
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
  content_json TEXT NOT NULL CHECK (json_valid(content_json)),
  provider_message_id TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (conversation_id, sequence),
  UNIQUE (conversation_id, provider_message_id)
) STRICT;
CREATE INDEX messages_conversation_sequence_idx ON messages(conversation_id, sequence);
CREATE INDEX messages_turn_idx ON messages(turn_id) WHERE turn_id IS NOT NULL;

CREATE TABLE idempotency_keys (
  scope TEXT NOT NULL,
  key TEXT NOT NULL,
  request_hash TEXT NOT NULL CHECK (length(request_hash) = 64),
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'completed')),
  response_json TEXT CHECK (response_json IS NULL OR json_valid(response_json)),
  created_at TEXT NOT NULL,
  completed_at TEXT,
  PRIMARY KEY (scope, key),
  CHECK ((state = 'pending' AND response_json IS NULL AND completed_at IS NULL)
      OR (state = 'completed' AND response_json IS NOT NULL AND completed_at IS NOT NULL))
) STRICT;

CREATE TABLE legacy_imports (
  source_kind TEXT NOT NULL,
  source_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE RESTRICT,
  imported_at TEXT NOT NULL,
  PRIMARY KEY (source_kind, source_id)
) STRICT;
CREATE INDEX legacy_imports_conversation_idx ON legacy_imports(conversation_id);
`

export const v10Sql = `
CREATE TABLE follow_up_operations (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  owner_user_id TEXT,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL CHECK (length(request_hash) = 64),
  prompt TEXT NOT NULL CHECK (length(prompt) BETWEEN 1 AND 8000),
  attachments_json TEXT NOT NULL CHECK (json_valid(attachments_json)),
  execution_mode TEXT NOT NULL CHECK (execution_mode IN ('queued', 'immediate')),
  state TEXT NOT NULL CHECK (state IN ('prepared', 'ready', 'running', 'completed', 'failed')),
  guidance_id TEXT,
  turn_id TEXT,
  response_json TEXT CHECK (response_json IS NULL OR json_valid(response_json)),
  error_json TEXT CHECK (error_json IS NULL OR json_valid(error_json)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  UNIQUE (task_id, idempotency_key)
) STRICT;
CREATE INDEX follow_up_operations_recovery_idx ON follow_up_operations(state, created_at);
CREATE INDEX follow_up_operations_task_idx ON follow_up_operations(task_id, created_at);
`

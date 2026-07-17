export const v12Sql = `
CREATE TABLE follow_up_attachments (
  id TEXT PRIMARY KEY,
  operation_id TEXT NOT NULL REFERENCES follow_up_operations(id) ON DELETE CASCADE,
  task_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  owner_user_id TEXT,
  path TEXT NOT NULL,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  mime_type TEXT NOT NULL CHECK (length(mime_type) BETWEEN 1 AND 160),
  size INTEGER NOT NULL CHECK (size BETWEEN 1 AND 262144),
  sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
  content BLOB NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('reserved', 'materialized', 'cleaned')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (operation_id, path)
) STRICT;
CREATE INDEX follow_up_attachments_operation_idx ON follow_up_attachments(operation_id, created_at);
CREATE INDEX follow_up_attachments_task_idx ON follow_up_attachments(task_id, path);
`

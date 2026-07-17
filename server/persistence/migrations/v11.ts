export const v11Sql = `
ALTER TABLE follow_up_operations ADD COLUMN lease_owner TEXT;
ALTER TABLE follow_up_operations ADD COLUMN lease_expires_at TEXT;
ALTER TABLE follow_up_operations ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0);
ALTER TABLE follow_up_operations ADD COLUMN execution_id TEXT;
ALTER TABLE follow_up_operations ADD COLUMN provider_request_id TEXT;
ALTER TABLE follow_up_operations ADD COLUMN provider_state TEXT NOT NULL DEFAULT 'not_started' CHECK (provider_state IN ('not_started', 'started', 'succeeded', 'failed', 'unknown'));
ALTER TABLE follow_up_operations ADD COLUMN provider_started_at TEXT;
ALTER TABLE follow_up_operations ADD COLUMN provider_completed_at TEXT;
UPDATE follow_up_operations SET execution_id = id WHERE execution_id IS NULL;
UPDATE follow_up_operations SET provider_request_id = 'onevibe:' || id WHERE provider_request_id IS NULL;
CREATE UNIQUE INDEX follow_up_operations_execution_id_idx ON follow_up_operations(execution_id);
CREATE INDEX follow_up_operations_lease_idx ON follow_up_operations(state, lease_expires_at);
`

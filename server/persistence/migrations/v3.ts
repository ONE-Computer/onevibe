export const v3Sql = `
CREATE TABLE runtime_leases (
  id TEXT PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 128),
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE RESTRICT,
  generation INTEGER NOT NULL CHECK (generation > 0),
  provider_name TEXT NOT NULL CHECK (length(provider_name) BETWEEN 1 AND 64),
  provider_sandbox_id TEXT CHECK (provider_sandbox_id IS NULL OR length(provider_sandbox_id) BETWEEN 1 AND 512),
  status TEXT NOT NULL CHECK (status IN ('allocating', 'ready', 'releasing', 'released', 'failed', 'unknown')),
  allocation_operation_id TEXT NOT NULL CHECK (length(allocation_operation_id) BETWEEN 1 AND 255),
  allocation_idempotency_key TEXT NOT NULL CHECK (length(allocation_idempotency_key) BETWEEN 1 AND 255),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  ready_at TEXT,
  release_requested_at TEXT,
  released_at TEXT,
  last_error_code TEXT CHECK (last_error_code IS NULL OR length(last_error_code) BETWEEN 1 AND 128),
  last_error_category TEXT CHECK (last_error_category IS NULL OR last_error_category IN ('provider', 'transient', 'configuration', 'capacity', 'security', 'unknown')),
  last_error_retryable INTEGER CHECK (last_error_retryable IS NULL OR last_error_retryable IN (0, 1)),
  last_error_at TEXT,
  UNIQUE (conversation_id, generation),
  UNIQUE (provider_name, allocation_idempotency_key),
  UNIQUE (allocation_operation_id),
  CHECK (updated_at >= created_at),
  CHECK (ready_at IS NULL OR ready_at >= created_at),
  CHECK (release_requested_at IS NULL OR release_requested_at >= created_at),
  CHECK (released_at IS NULL OR release_requested_at IS NOT NULL),
  CHECK (released_at IS NULL OR released_at >= release_requested_at),
  CHECK (status != 'ready' OR (provider_sandbox_id IS NOT NULL AND ready_at IS NOT NULL)),
  CHECK (status NOT IN ('releasing', 'released') OR (provider_sandbox_id IS NOT NULL AND release_requested_at IS NOT NULL)),
  CHECK (status != 'released' OR released_at IS NOT NULL),
  CHECK (status != 'failed' OR (last_error_code IS NOT NULL AND last_error_category IS NOT NULL AND last_error_retryable IS NOT NULL AND last_error_at IS NOT NULL)),
  CHECK ((last_error_code IS NULL AND last_error_category IS NULL AND last_error_retryable IS NULL AND last_error_at IS NULL)
      OR (last_error_code IS NOT NULL AND last_error_category IS NOT NULL AND last_error_retryable IS NOT NULL AND last_error_at IS NOT NULL))
) STRICT;

CREATE UNIQUE INDEX runtime_leases_one_active_per_conversation_idx
  ON runtime_leases(conversation_id)
  WHERE status IN ('allocating', 'ready', 'releasing', 'unknown');
CREATE UNIQUE INDEX runtime_leases_provider_sandbox_idx
  ON runtime_leases(provider_name, provider_sandbox_id)
  WHERE provider_sandbox_id IS NOT NULL;
CREATE INDEX runtime_leases_conversation_generation_idx
  ON runtime_leases(conversation_id, generation DESC);
CREATE INDEX runtime_leases_status_updated_idx
  ON runtime_leases(status, updated_at);
`

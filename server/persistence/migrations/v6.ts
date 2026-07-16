export const v6Sql = `
CREATE TABLE runtime_mcp_configs (
  id TEXT PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 255),
  name TEXT NOT NULL UNIQUE CHECK (length(name) BETWEEN 2 AND 80),
  command TEXT NOT NULL CHECK (length(command) BETWEEN 1 AND 200),
  args_json TEXT NOT NULL CHECK (json_valid(args_json)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL CHECK (updated_at >= created_at)
) STRICT;

CREATE INDEX runtime_mcp_configs_updated_idx ON runtime_mcp_configs(updated_at DESC);

CREATE TABLE runtime_mcp_config_events (
  id TEXT PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 255),
  config_id TEXT NOT NULL CHECK (length(config_id) BETWEEN 1 AND 255),
  action TEXT NOT NULL CHECK (action IN ('created', 'deleted')),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 2 AND 80),
  command TEXT NOT NULL CHECK (length(command) BETWEEN 1 AND 200),
  args_json TEXT NOT NULL CHECK (json_valid(args_json)),
  created_at TEXT NOT NULL
) STRICT;

CREATE INDEX runtime_mcp_config_events_created_idx ON runtime_mcp_config_events(created_at DESC);
`

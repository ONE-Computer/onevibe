export const v7Sql = `
ALTER TABLE runtime_mcp_configs ADD COLUMN owner_user_id TEXT;
CREATE INDEX runtime_mcp_configs_owner_idx ON runtime_mcp_configs(owner_user_id, updated_at DESC);
`

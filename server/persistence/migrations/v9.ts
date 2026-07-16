export const v9Sql = `
CREATE TABLE organizations (
  id TEXT PRIMARY KEY CHECK (length(id) BETWEEN 4 AND 80),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 2 AND 160),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL CHECK (updated_at >= created_at)
) STRICT;

CREATE TABLE organization_members (
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL CHECK (length(user_id) BETWEEN 1 AND 255),
  role TEXT NOT NULL CHECK (role IN ('owner', 'member')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (organization_id, user_id)
) STRICT;

CREATE INDEX organization_members_user_idx ON organization_members(user_id, organization_id);
CREATE INDEX organization_members_org_role_idx ON organization_members(organization_id, role);
`

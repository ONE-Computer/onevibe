export const v8Sql = `
CREATE TABLE skill_installations (
  id TEXT NOT NULL CHECK (length(id) BETWEEN 2 AND 64),
  owner_scope TEXT NOT NULL CHECK (length(owner_scope) BETWEEN 2 AND 255),
  owner_user_id TEXT,
  version INTEGER NOT NULL CHECK (version >= 1),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 160),
  summary TEXT NOT NULL CHECK (length(summary) BETWEEN 1 AND 500),
  sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
  content TEXT NOT NULL CHECK (length(content) BETWEEN 1 AND 262144),
  content_url TEXT NOT NULL CHECK (length(content_url) BETWEEN 1 AND 2048),
  source_url TEXT NOT NULL CHECK (length(source_url) BETWEEN 1 AND 2048),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL CHECK (updated_at >= created_at),
  PRIMARY KEY (owner_scope, id)
) STRICT;

CREATE INDEX skill_installations_owner_updated_idx ON skill_installations(owner_scope, updated_at DESC);
`

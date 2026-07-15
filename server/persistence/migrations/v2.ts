export const v2Sql = `
ALTER TABLE messages ADD COLUMN revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0);
ALTER TABLE messages ADD COLUMN status TEXT NOT NULL DEFAULT 'completed'
  CHECK (status IN ('streaming', 'completed', 'failed', 'cancelled'));

ALTER TABLE legacy_imports RENAME TO legacy_imports_v1;
CREATE TABLE legacy_imports (
  source_kind TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_digest TEXT NOT NULL CHECK (length(source_digest) = 64),
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE RESTRICT,
  result_json TEXT NOT NULL CHECK (json_valid(result_json)),
  imported_at TEXT NOT NULL,
  PRIMARY KEY (source_kind, source_id)
) STRICT;
INSERT INTO legacy_imports(source_kind, source_id, source_digest, conversation_id, result_json, imported_at)
SELECT source_kind, source_id, printf('%064d', 0), conversation_id,
       json_object('status', 'imported_before_v2'), imported_at
FROM legacy_imports_v1;
DROP TABLE legacy_imports_v1;
CREATE INDEX legacy_imports_conversation_idx ON legacy_imports(conversation_id);
`

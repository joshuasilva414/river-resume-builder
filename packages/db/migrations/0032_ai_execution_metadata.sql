CREATE TABLE ai_execution_metadata (
  operation_id TEXT PRIMARY KEY NOT NULL REFERENCES operations(id),
  owner_id TEXT NOT NULL REFERENCES user(id),
  data TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

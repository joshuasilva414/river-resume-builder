CREATE TABLE source_upload_checks (
  source_id TEXT PRIMARY KEY NOT NULL REFERENCES sources(id),
  checked_at INTEGER NOT NULL
);

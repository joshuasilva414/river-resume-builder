CREATE TABLE job_imports (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL REFERENCES user(id),
  input TEXT NOT NULL CHECK(json_valid(input)),
  profile TEXT NOT NULL CHECK(json_valid(profile)),
  text TEXT NOT NULL DEFAULT '',
  retrieved_url TEXT,
  retrieval_method TEXT,
  analysis TEXT CHECK(analysis IS NULL OR json_valid(analysis)),
  latest_operation_id TEXT NOT NULL REFERENCES operations(id),
  revision INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 1,
  saved_job_id TEXT REFERENCES job_targets(id),
  created_at INTEGER NOT NULL
);
CREATE INDEX job_imports_owner ON job_imports(owner_id, created_at);

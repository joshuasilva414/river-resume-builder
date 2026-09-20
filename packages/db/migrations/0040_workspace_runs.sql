CREATE TABLE workspace_runs (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL REFERENCES user(id),
  operation_id TEXT NOT NULL REFERENCES operations(id),
  kind TEXT NOT NULL CHECK(kind IN ('fact-import','suggestion','resume-score','template-score')),
  target_id TEXT,
  input TEXT NOT NULL CHECK(json_valid(input)),
  result TEXT CHECK(result IS NULL OR json_valid(result)),
  metadata TEXT CHECK(metadata IS NULL OR json_valid(metadata)),
  state TEXT NOT NULL CHECK(state IN ('Running','Complete','Failed')),
  error TEXT,
  created_at INTEGER NOT NULL,
  completed_at INTEGER
);
CREATE INDEX workspace_runs_owner ON workspace_runs(owner_id,kind,created_at);

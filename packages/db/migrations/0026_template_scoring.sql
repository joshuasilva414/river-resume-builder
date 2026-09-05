CREATE TABLE template_scoring_runs (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL REFERENCES user(id),
  base TEXT NOT NULL,
  graph TEXT NOT NULL,
  graph_digest TEXT NOT NULL,
  fixture_set TEXT NOT NULL,
  profile TEXT NOT NULL,
  operation_id TEXT NOT NULL REFERENCES operations(id),
  revision INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 1 CHECK (attempts BETWEEN 1 AND 3),
  created_at INTEGER NOT NULL,
  completed_at INTEGER
);
CREATE INDEX template_scoring_history ON template_scoring_runs(owner_id, graph_digest, created_at);
CREATE TABLE template_scoring_attempts (
  operation_id TEXT PRIMARY KEY NOT NULL REFERENCES operations(id),
  run_id TEXT NOT NULL REFERENCES template_scoring_runs(id),
  ordinal INTEGER NOT NULL CHECK (ordinal BETWEEN 1 AND 3),
  report TEXT,
  report_digest TEXT,
  failure TEXT,
  created_at INTEGER NOT NULL,
  completed_at INTEGER
);
CREATE UNIQUE INDEX template_scoring_attempt_ordinal ON template_scoring_attempts(run_id, ordinal);
CREATE TABLE template_scoring_fixtures (
  run_id TEXT NOT NULL REFERENCES template_scoring_runs(id),
  fixture_id TEXT NOT NULL,
  document TEXT,
  document_digest TEXT,
  raw_response_json TEXT,
  result_digest TEXT,
  result_operation_id TEXT REFERENCES operations(id),
  received_at INTEGER,
  PRIMARY KEY (run_id, fixture_id)
);
CREATE TABLE template_scoring_fixture_attempts (
  operation_id TEXT NOT NULL REFERENCES template_scoring_attempts(operation_id),
  fixture_id TEXT NOT NULL,
  observation TEXT,
  submitted_at INTEGER,
  failure TEXT,
  PRIMARY KEY (operation_id, fixture_id)
);

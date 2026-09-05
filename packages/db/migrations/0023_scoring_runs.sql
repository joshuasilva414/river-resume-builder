CREATE TABLE scoring_runs (
  id text PRIMARY KEY NOT NULL,
  owner_id text NOT NULL REFERENCES user(id),
  checkpoint_id text NOT NULL REFERENCES resume_checkpoints(id),
  snapshot_id text NOT NULL REFERENCES job_posting_snapshots(id),
  document_operation_id text NOT NULL REFERENCES operations(id),
  operation_id text NOT NULL REFERENCES operations(id),
  revision integer NOT NULL DEFAULT 0,
  attempts integer NOT NULL DEFAULT 1 CHECK (attempts BETWEEN 1 AND 3),
  profile text NOT NULL,
  input text,
  result text,
  completed_at integer,
  created_at integer NOT NULL
);
CREATE INDEX scoring_checkpoint_history ON scoring_runs(owner_id, checkpoint_id, created_at);
CREATE TABLE scoring_attempts (
  operation_id text PRIMARY KEY NOT NULL REFERENCES operations(id),
  run_id text NOT NULL REFERENCES scoring_runs(id),
  ordinal integer NOT NULL CHECK (ordinal BETWEEN 1 AND 3),
  observation text,
  submitted_at integer,
  failure text,
  created_at integer NOT NULL
);
CREATE UNIQUE INDEX scoring_attempt_ordinal ON scoring_attempts(run_id, ordinal);

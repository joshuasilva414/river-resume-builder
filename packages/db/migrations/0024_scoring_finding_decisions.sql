CREATE TABLE scoring_finding_decisions (
  id text PRIMARY KEY NOT NULL,
  run_id text NOT NULL REFERENCES scoring_runs(id),
  platform text NOT NULL,
  finding_index integer NOT NULL,
  result_digest text NOT NULL,
  finding_digest text NOT NULL,
  revision integer NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('Addressed', 'Accepted', 'Not applicable')),
  rationale text NOT NULL,
  updated_at integer NOT NULL
);
CREATE UNIQUE INDEX scoring_finding_decision ON scoring_finding_decisions(run_id, platform, finding_index);

-- New selections are independent of the archived evidence-review graph.
CREATE TABLE job_fact_selections (
  job_id TEXT PRIMARY KEY REFERENCES job_targets(id),
  fact_ids TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(fact_ids)),
  updated_at INTEGER NOT NULL
);

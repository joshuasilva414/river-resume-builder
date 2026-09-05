CREATE TABLE template_source_promotions (
  task_id TEXT PRIMARY KEY NOT NULL REFERENCES template_ai_tasks(id),
  checkpoint_id TEXT NOT NULL REFERENCES resume_checkpoints(id),
  candidate_digest TEXT NOT NULL
);

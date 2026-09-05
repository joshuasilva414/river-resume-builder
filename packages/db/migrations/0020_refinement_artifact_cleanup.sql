CREATE TABLE `source_refinement_artifact_cleanup` (
  `task_id` text PRIMARY KEY NOT NULL REFERENCES `source_refinement_tasks`(`id`),
  `created_at` integer NOT NULL,
  `settle_after` integer NOT NULL,
  `last_attempt_at` integer,
  `completed_at` integer
);

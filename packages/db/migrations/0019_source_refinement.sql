CREATE TABLE `checkpoint_source_overrides` (
  `checkpoint_id` text PRIMARY KEY NOT NULL REFERENCES `resume_checkpoints`(`id`),
  `base_checkpoint_id` text NOT NULL REFERENCES `resume_checkpoints`(`id`),
  `structured_base_id` text NOT NULL REFERENCES `resume_checkpoints`(`id`),
  `proposal_id` text NOT NULL UNIQUE,
  `source` text NOT NULL,
  `fields` text NOT NULL,
  `candidate_digest` text NOT NULL,
  `review_digest` text NOT NULL,
  `base_template_identity` text NOT NULL
);
CREATE TABLE `source_refinement_tasks` (
  `id` text PRIMARY KEY NOT NULL,
  `owner_id` text NOT NULL REFERENCES `user`(`id`),
  `base_checkpoint_id` text NOT NULL REFERENCES `resume_checkpoints`(`id`),
  `input` text NOT NULL,
  `dependencies` text NOT NULL,
  `profile` text NOT NULL,
  `latest_operation_id` text NOT NULL REFERENCES `operations`(`id`),
  `generation_attempts` integer DEFAULT 1 NOT NULL,
  `preview_attempts` integer DEFAULT 1 NOT NULL,
  `revision` integer DEFAULT 0 NOT NULL,
  `created_at` integer NOT NULL
);
CREATE INDEX `source_refinement_checkpoint` ON `source_refinement_tasks`(`owner_id`,`base_checkpoint_id`,`created_at`);
CREATE TABLE `source_refinement_proposals` (
  `id` text PRIMARY KEY NOT NULL,
  `task_id` text NOT NULL UNIQUE REFERENCES `source_refinement_tasks`(`id`),
  `state` text NOT NULL,
  `payload` text,
  `candidate_digest` text NOT NULL,
  `comparison` text,
  `preview_operation_id` text REFERENCES `operations`(`id`),
  `preview_artifacts` text,
  `review_digest` text,
  `acceptance_operation_id` text REFERENCES `operations`(`id`),
  `acceptance_attempts` integer DEFAULT 0 NOT NULL,
  `result_checkpoint_id` text,
  `created_at` integer NOT NULL,
  `reviewed_at` integer
);

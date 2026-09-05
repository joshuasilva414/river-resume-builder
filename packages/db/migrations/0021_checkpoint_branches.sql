CREATE TABLE `resume_checkpoint_branches` (
  `draft_id` text PRIMARY KEY NOT NULL REFERENCES `resume_drafts`(`id`),
  `from_checkpoint_id` text NOT NULL REFERENCES `resume_checkpoints`(`id`),
  `structured_base_id` text NOT NULL REFERENCES `resume_checkpoints`(`id`)
);

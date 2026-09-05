CREATE TABLE `checkpoint_acknowledgments` (
	`report_id` text NOT NULL,
	`issue_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`report_id`, `issue_id`),
	FOREIGN KEY (`report_id`) REFERENCES `checkpoint_review_reports`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `checkpoint_exports` (
	`checkpoint_id` text PRIMARY KEY NOT NULL,
	`report_id` text NOT NULL,
	`operation_id` text NOT NULL,
	`digest` text NOT NULL,
	`actor_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`checkpoint_id`) REFERENCES `resume_checkpoints`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`report_id`) REFERENCES `checkpoint_review_reports`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`operation_id`) REFERENCES `operations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `checkpoint_review_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`checkpoint_id` text NOT NULL,
	`digest` text NOT NULL,
	`policy_version` text NOT NULL,
	`issues` text NOT NULL,
	`evidence` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`checkpoint_id`) REFERENCES `resume_checkpoints`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `checkpoint_state` (
	`checkpoint_id` text PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`report_id` text NOT NULL,
	`operation_id` text NOT NULL,
	`attempts` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`checkpoint_id`) REFERENCES `resume_checkpoints`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`report_id`) REFERENCES `checkpoint_review_reports`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`operation_id`) REFERENCES `operations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `resume_checkpoints` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`draft_id` text NOT NULL,
	`draft_revision` integer NOT NULL,
	`snapshot_id` text NOT NULL,
	`data` text NOT NULL,
	`graph` text NOT NULL,
	`evidence` text NOT NULL,
	`document` text NOT NULL,
	`template_identity` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`draft_id`) REFERENCES `resume_drafts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`snapshot_id`) REFERENCES `job_posting_snapshots`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `checkpoint_draft_history` ON `resume_checkpoints` (`owner_id`,`draft_id`,`created_at`);
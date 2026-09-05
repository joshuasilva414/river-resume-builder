CREATE TABLE `job_evidence_references` (
	`workspace_revision_id` text NOT NULL,
	`claim_id` text NOT NULL,
	`evidence_revision_id` text NOT NULL,
	`association` text NOT NULL,
	PRIMARY KEY(`workspace_revision_id`, `claim_id`, `association`),
	FOREIGN KEY (`workspace_revision_id`) REFERENCES `job_workspace_revisions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`claim_id`) REFERENCES `evidence_claims`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`evidence_revision_id`) REFERENCES `evidence_revisions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `job_evidence_revision` ON `job_evidence_references` (`evidence_revision_id`);--> statement-breakpoint
CREATE TABLE `job_posting_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`details` text NOT NULL,
	`text` text NOT NULL,
	`url` text,
	`digest` text NOT NULL,
	`actor_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `job_targets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `posting_job_history` ON `job_posting_snapshots` (`job_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `job_workspace_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`snapshot_id` text NOT NULL,
	`data` text NOT NULL,
	`actor_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`snapshot_id`) REFERENCES `job_posting_snapshots`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `job_workspace_history` ON `job_workspace_revisions` (`snapshot_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `job_workspaces` (
	`snapshot_id` text PRIMARY KEY NOT NULL,
	`current_revision_id` text NOT NULL,
	FOREIGN KEY (`snapshot_id`) REFERENCES `job_posting_snapshots`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`current_revision_id`) REFERENCES `job_workspace_revisions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `job_targets` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`details` text NOT NULL,
	`current_snapshot_id` text NOT NULL,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `jobs_owner_lifecycle` ON `job_targets` (`owner_id`,`archived_at`);
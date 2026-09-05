CREATE TABLE `resume_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`job_id` text NOT NULL,
	`snapshot_id` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`data` text NOT NULL,
	`branch_of` text,
	`branch_revision` integer,
	`preview_request_id` text,
	`last_preview_id` text,
	`last_preview_revision` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`job_id`) REFERENCES `job_targets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`snapshot_id`) REFERENCES `job_posting_snapshots`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `resume_drafts_job` ON `resume_drafts` (`owner_id`,`job_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `resume_evidence_references` (
	`draft_id` text NOT NULL,
	`revision_id` text NOT NULL,
	PRIMARY KEY(`draft_id`, `revision_id`),
	FOREIGN KEY (`draft_id`) REFERENCES `resume_drafts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`revision_id`) REFERENCES `evidence_revisions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `resume_evidence_reverse` ON `resume_evidence_references` (`revision_id`);--> statement-breakpoint
CREATE TABLE `resume_library_references` (
	`draft_id` text NOT NULL,
	`revision_id` text NOT NULL,
	PRIMARY KEY(`draft_id`, `revision_id`),
	FOREIGN KEY (`draft_id`) REFERENCES `resume_drafts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`revision_id`) REFERENCES `library_revisions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `resume_library_reverse` ON `resume_library_references` (`revision_id`);
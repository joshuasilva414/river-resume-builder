CREATE TABLE `resume_template_references` (
	`draft_id` text PRIMARY KEY NOT NULL,
	`revision_id` text NOT NULL,
	FOREIGN KEY (`draft_id`) REFERENCES `resume_drafts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`revision_id`) REFERENCES `template_revisions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `resume_template_revision_idx` ON `resume_template_references` (`revision_id`);--> statement-breakpoint
ALTER TABLE `resume_checkpoints` ADD `template_graph` text;
CREATE TABLE `library_child_references` (
	`revision_id` text NOT NULL,
	`child_revision_id` text NOT NULL,
	PRIMARY KEY(`revision_id`, `child_revision_id`),
	FOREIGN KEY (`revision_id`) REFERENCES `library_revisions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`child_revision_id`) REFERENCES `library_revisions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `library_child_usage` ON `library_child_references` (`child_revision_id`);--> statement-breakpoint
CREATE TABLE `library_evidence_references` (
	`revision_id` text NOT NULL,
	`evidence_revision_id` text NOT NULL,
	PRIMARY KEY(`revision_id`, `evidence_revision_id`),
	FOREIGN KEY (`revision_id`) REFERENCES `library_revisions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`evidence_revision_id`) REFERENCES `evidence_revisions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `library_evidence_usage` ON `library_evidence_references` (`evidence_revision_id`);--> statement-breakpoint
CREATE TABLE `library_items` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`kind` text NOT NULL,
	`type` text NOT NULL,
	`label` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`current_revision_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `library_owner_kind` ON `library_items` (`owner_id`,`kind`,`type`,`updated_at`);--> statement-breakpoint
CREATE TABLE `library_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`data` text NOT NULL,
	`label` text NOT NULL,
	`rationale` text NOT NULL,
	`actor_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `library_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `library_revision_history` ON `library_revisions` (`item_id`,`created_at`);
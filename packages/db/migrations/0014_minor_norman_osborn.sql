CREATE TABLE `template_designs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`scope` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`current_revision_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `template_designs_owner` ON `template_designs` (`owner_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `template_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`design_id` text NOT NULL,
	`version` integer NOT NULL,
	`graph` text NOT NULL,
	`digest` text NOT NULL,
	`origins` text NOT NULL,
	`state` text DEFAULT 'Draft' NOT NULL,
	`review_revision` integer DEFAULT 0 NOT NULL,
	`validation_attempts` integer DEFAULT 0 NOT NULL,
	`validation_id` text,
	`created_at` integer NOT NULL,
	`actor_id` text NOT NULL,
	FOREIGN KEY (`design_id`) REFERENCES `template_designs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `template_revision_version` ON `template_revisions` (`design_id`,`version`);--> statement-breakpoint
CREATE INDEX `template_revision_state` ON `template_revisions` (`state`);--> statement-breakpoint
CREATE TABLE `template_validation_fixtures` (
	`validation_id` text NOT NULL,
	`fixture_id` text NOT NULL,
	`result` text NOT NULL,
	PRIMARY KEY(`validation_id`, `fixture_id`),
	FOREIGN KEY (`validation_id`) REFERENCES `template_validations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `template_validations` (
	`id` text PRIMARY KEY NOT NULL,
	`revision_id` text NOT NULL,
	`operation_id` text NOT NULL,
	`graph_digest` text NOT NULL,
	`fixture_set_digest` text NOT NULL,
	`renderer` text NOT NULL,
	`validator` text NOT NULL,
	`report` text,
	`report_digest` text,
	`created_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`revision_id`) REFERENCES `template_revisions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`operation_id`) REFERENCES `operations`(`id`) ON UPDATE no action ON DELETE no action
);

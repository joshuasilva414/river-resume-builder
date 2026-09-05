CREATE TABLE `wording_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`operation_id` text NOT NULL,
	`digest` text NOT NULL,
	`payload` text,
	`state` text NOT NULL,
	`revision` integer NOT NULL,
	`created_at` integer NOT NULL,
	`reviewed_at` integer,
	`applied_revision` integer,
	FOREIGN KEY (`task_id`) REFERENCES `wording_tasks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`operation_id`) REFERENCES `operations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `wording_proposals_task_id_unique` ON `wording_proposals` (`task_id`);--> statement-breakpoint
CREATE TABLE `wording_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`draft_id` text NOT NULL,
	`input` text NOT NULL,
	`draft_revision` integer NOT NULL,
	`profile` text NOT NULL,
	`latest_operation_id` text NOT NULL,
	`attempts` integer NOT NULL,
	`revision` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`draft_id`) REFERENCES `resume_drafts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`latest_operation_id`) REFERENCES `operations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `wording_tasks_draft` ON `wording_tasks` (`owner_id`,`draft_id`,`created_at`);
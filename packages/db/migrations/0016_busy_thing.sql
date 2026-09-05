CREATE TABLE `template_ai_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`operation_id` text NOT NULL,
	`digest` text NOT NULL,
	`payload` text,
	`state` text DEFAULT 'Pending' NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`preview_operation_id` text,
	`preview_digest` text,
	`preview_artifacts` text,
	`preview_attempts` integer DEFAULT 1 NOT NULL,
	`result_revision_id` text,
	`created_at` integer NOT NULL,
	`reviewed_at` integer,
	`preview_cleaned_at` integer,
	FOREIGN KEY (`task_id`) REFERENCES `template_ai_tasks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`operation_id`) REFERENCES `operations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`preview_operation_id`) REFERENCES `operations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`result_revision_id`) REFERENCES `template_revisions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `template_ai_proposals_task_id_unique` ON `template_ai_proposals` (`task_id`);--> statement-breakpoint
CREATE TABLE `template_ai_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`destination_id` text,
	`destination_revision` integer,
	`base` text NOT NULL,
	`dependency` text,
	`input` text NOT NULL,
	`input_digest` text NOT NULL,
	`profile` text NOT NULL,
	`latest_operation_id` text NOT NULL,
	`attempts` integer DEFAULT 1 NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`destination_id`) REFERENCES `template_designs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`latest_operation_id`) REFERENCES `operations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `template_ai_owner` ON `template_ai_tasks` (`owner_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `template_ai_destination` ON `template_ai_tasks` (`destination_id`);
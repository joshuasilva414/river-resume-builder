CREATE TABLE `ai_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`operation_id` text NOT NULL,
	`payload` text,
	`state` text NOT NULL,
	`revision` integer NOT NULL,
	`created_at` integer NOT NULL,
	`reviewed_at` integer,
	FOREIGN KEY (`task_id`) REFERENCES `ai_tasks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`operation_id`) REFERENCES `operations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_proposals_task_id_unique` ON `ai_proposals` (`task_id`);--> statement-breakpoint
CREATE TABLE `ai_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`job_id` text NOT NULL,
	`input` text NOT NULL,
	`profile` text NOT NULL,
	`latest_operation_id` text NOT NULL,
	`attempts` integer NOT NULL,
	`revision` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`job_id`) REFERENCES `job_targets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`latest_operation_id`) REFERENCES `operations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `ai_tasks_job` ON `ai_tasks` (`owner_id`,`job_id`,`created_at`);
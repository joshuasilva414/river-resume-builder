CREATE TABLE `duplicate_ai_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`operation_id` text NOT NULL,
	`digest` text NOT NULL,
	`payload` text,
	`state` text NOT NULL,
	`revision` integer NOT NULL,
	`created_at` integer NOT NULL,
	`reviewed_at` integer,
	FOREIGN KEY (`task_id`) REFERENCES `duplicate_ai_tasks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`operation_id`) REFERENCES `operations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `duplicate_ai_proposals_task_id_unique` ON `duplicate_ai_proposals` (`task_id`);--> statement-breakpoint
CREATE TABLE `duplicate_ai_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`pair_id` text NOT NULL,
	`first_claim_id` text NOT NULL,
	`second_claim_id` text NOT NULL,
	`input` text NOT NULL,
	`profile` text NOT NULL,
	`latest_operation_id` text NOT NULL,
	`attempts` integer NOT NULL,
	`revision` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`pair_id`) REFERENCES `evidence_duplicates`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`first_claim_id`) REFERENCES `evidence_claims`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`second_claim_id`) REFERENCES `evidence_claims`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`latest_operation_id`) REFERENCES `operations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `duplicate_ai_first` ON `duplicate_ai_tasks` (`owner_id`,`first_claim_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `duplicate_ai_second` ON `duplicate_ai_tasks` (`owner_id`,`second_claim_id`,`created_at`);
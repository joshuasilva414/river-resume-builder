CREATE TABLE `clarification_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`candidate_id` text NOT NULL,
	`claim_id` text NOT NULL,
	`evidence_revision_id` text NOT NULL,
	`question` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`answer_source_id` text,
	`answer_evidence_revision_id` text,
	`created_at` integer NOT NULL,
	`answered_at` integer,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`candidate_id`) REFERENCES `source_ai_candidates`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`claim_id`) REFERENCES `evidence_claims`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`evidence_revision_id`) REFERENCES `evidence_revisions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`answer_source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`answer_evidence_revision_id`) REFERENCES `evidence_revisions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `clarification_claim` ON `clarification_requests` (`owner_id`,`claim_id`);--> statement-breakpoint
CREATE TABLE `source_ai_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`source_id` text NOT NULL,
	`input` text NOT NULL,
	`profile` text NOT NULL,
	`latest_operation_id` text NOT NULL,
	`attempts` integer NOT NULL,
	`revision` integer NOT NULL,
	`created_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`latest_operation_id`) REFERENCES `operations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `source_ai_tasks_source` ON `source_ai_tasks` (`owner_id`,`source_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `source_ai_candidates` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`operation_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`digest` text NOT NULL,
	`payload` text,
	`state` text NOT NULL,
	`revision` integer NOT NULL,
	`created_at` integer NOT NULL,
	`reviewed_at` integer,
	`claim_id` text,
	`evidence_revision_id` text,
	FOREIGN KEY (`task_id`) REFERENCES `source_ai_tasks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`operation_id`) REFERENCES `operations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`claim_id`) REFERENCES `evidence_claims`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`evidence_revision_id`) REFERENCES `evidence_revisions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `source_ai_candidate_ordinal` ON `source_ai_candidates` (`task_id`,`ordinal`);
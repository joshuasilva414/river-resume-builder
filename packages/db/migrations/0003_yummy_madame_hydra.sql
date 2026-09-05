CREATE TABLE `source_processing_results` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`operation_id` text NOT NULL,
	`object_key` text NOT NULL,
	`digest` text NOT NULL,
	`parser` text NOT NULL,
	`parser_version` text NOT NULL,
	`character_count` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`operation_id`) REFERENCES `operations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `processing_source` ON `source_processing_results` (`source_id`);--> statement-breakpoint
CREATE TABLE `sources` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`title` text NOT NULL,
	`filename` text NOT NULL,
	`mime` text NOT NULL,
	`kind` text NOT NULL,
	`provenance_url` text,
	`note` text NOT NULL,
	`digest` text NOT NULL,
	`byte_length` integer NOT NULL,
	`object_key` text NOT NULL,
	`state` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`operation_id` text NOT NULL,
	`current_processing_id` text,
	`failure` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `sources_owner_created` ON `sources` (`owner_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `sources_digest` ON `sources` (`owner_id`,`digest`);
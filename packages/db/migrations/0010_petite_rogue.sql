CREATE TABLE `database_backups` (
	`date` text PRIMARY KEY NOT NULL,
	`operation_id` text NOT NULL,
	`manifest` text,
	`created_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`operation_id`) REFERENCES `operations`(`id`) ON UPDATE no action ON DELETE no action
);

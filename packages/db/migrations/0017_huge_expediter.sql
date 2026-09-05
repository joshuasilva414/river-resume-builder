CREATE TABLE `template_conversation_turns` (
	`task_id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`position` integer NOT NULL,
	`instruction` text NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `template_ai_tasks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`conversation_id`) REFERENCES `template_conversations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `template_conversation_position` ON `template_conversation_turns` (`conversation_id`,`position`);--> statement-breakpoint
CREATE TABLE `template_conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO template_conversations (id, owner_id, revision, created_at)
SELECT json_extract(input, '$.destination.id'), owner_id, count(*), min(created_at)
FROM template_ai_tasks GROUP BY json_extract(input, '$.destination.id'), owner_id;
--> statement-breakpoint
INSERT INTO template_conversation_turns (task_id, conversation_id, position, instruction)
SELECT id, json_extract(input, '$.destination.id'),
  row_number() OVER (PARTITION BY json_extract(input, '$.destination.id') ORDER BY created_at, id),
  'Structure: ' || json_extract(input, '$.brief.structure') || char(10) ||
  'Density: ' || json_extract(input, '$.brief.density') || char(10) ||
  'Visual character: ' || json_extract(input, '$.brief.character') || char(10) ||
  'Constraints: ' || json_extract(input, '$.brief.constraints')
FROM template_ai_tasks;

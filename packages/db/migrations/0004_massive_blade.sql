CREATE TABLE `evidence_citation_references` (
	`revision_id` text NOT NULL,
	`source_id` text NOT NULL,
	`processing_id` text NOT NULL,
	PRIMARY KEY(`revision_id`, `source_id`, `processing_id`),
	FOREIGN KEY (`revision_id`) REFERENCES `evidence_revisions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`processing_id`) REFERENCES `source_processing_results`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `citation_processing` ON `evidence_citation_references` (`processing_id`);--> statement-breakpoint
CREATE TABLE `evidence_claims` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`revision` integer NOT NULL,
	`current_revision_id` text NOT NULL,
	`assertion` text NOT NULL,
	`metadata` text NOT NULL,
	`review_state` text NOT NULL,
	`current_decision_id` text,
	`archived_at` integer,
	`merged_into_id` text,
	`search_text` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `evidence_owner_updated` ON `evidence_claims` (`owner_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `evidence_owner_state` ON `evidence_claims` (`owner_id`,`archived_at`,`review_state`);--> statement-breakpoint
CREATE TABLE `context_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`context_id` text NOT NULL,
	`data` text NOT NULL,
	`actor_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`context_id`) REFERENCES `contexts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `context_revision_parent` ON `context_revisions` (`context_id`);--> statement-breakpoint
CREATE TABLE `contexts` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`kind` text NOT NULL,
	`label` text NOT NULL,
	`revision` integer NOT NULL,
	`current_revision_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `context_owner` ON `contexts` (`owner_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `one_owner_profile` ON `contexts` (`owner_id`) WHERE "contexts"."kind" = 'Owner Profile';--> statement-breakpoint
CREATE TABLE `evidence_duplicates` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`first_id` text NOT NULL,
	`first_revision_id` text NOT NULL,
	`second_id` text NOT NULL,
	`second_revision_id` text NOT NULL,
	`similarity` integer NOT NULL,
	`state` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`rationale` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`first_id`) REFERENCES `evidence_claims`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`first_revision_id`) REFERENCES `evidence_revisions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`second_id`) REFERENCES `evidence_claims`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`second_revision_id`) REFERENCES `evidence_revisions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `duplicate_owner_state` ON `evidence_duplicates` (`owner_id`,`state`);--> statement-breakpoint
CREATE UNIQUE INDEX `duplicate_revision_pair` ON `evidence_duplicates` (`first_revision_id`,`second_revision_id`);--> statement-breakpoint
CREATE TABLE `evidence_context_references` (
	`revision_id` text NOT NULL,
	`context_id` text NOT NULL,
	`context_revision_id` text NOT NULL,
	PRIMARY KEY(`revision_id`, `context_id`),
	FOREIGN KEY (`revision_id`) REFERENCES `evidence_revisions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`context_id`) REFERENCES `contexts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`context_revision_id`) REFERENCES `context_revisions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `evidence_context_id` ON `evidence_context_references` (`context_id`);--> statement-breakpoint
CREATE TABLE `evidence_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`claim_id` text NOT NULL,
	`material` text NOT NULL,
	`actor_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`claim_id`) REFERENCES `evidence_claims`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `evidence_revision_claim` ON `evidence_revisions` (`claim_id`);--> statement-breakpoint
CREATE TABLE `evidence_review_decisions` (
	`id` text PRIMARY KEY NOT NULL,
	`claim_id` text NOT NULL,
	`revision_id` text NOT NULL,
	`state` text NOT NULL,
	`rationale` text NOT NULL,
	`actor_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`claim_id`) REFERENCES `evidence_claims`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`revision_id`) REFERENCES `evidence_revisions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `review_evidence_revision` ON `evidence_review_decisions` (`revision_id`);--> statement-breakpoint
ALTER TABLE `command_receipts` ADD `outcome` text;--> statement-breakpoint
CREATE VIRTUAL TABLE evidence_search USING fts5(claim_id UNINDEXED, search_text, tokenize='unicode61 remove_diacritics 2');
--> statement-breakpoint
CREATE TRIGGER evidence_search_insert AFTER INSERT ON evidence_claims BEGIN
  INSERT INTO evidence_search(claim_id, search_text) VALUES (new.id, new.search_text);
END;
--> statement-breakpoint
CREATE TRIGGER evidence_search_update AFTER UPDATE OF search_text ON evidence_claims BEGIN
  DELETE FROM evidence_search WHERE claim_id = old.id;
  INSERT INTO evidence_search(claim_id, search_text) VALUES (new.id, new.search_text);
END;
--> statement-breakpoint
CREATE TRIGGER evidence_search_delete AFTER DELETE ON evidence_claims BEGIN
  DELETE FROM evidence_search WHERE claim_id = old.id;
END;

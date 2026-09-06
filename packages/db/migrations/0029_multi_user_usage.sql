CREATE INDEX `operations_created` ON `operations` (`created_at`);--> statement-breakpoint
CREATE INDEX `operations_state` ON `operations` (`state`);
--> statement-breakpoint
-- Gate every new billable operation in the same transaction as its domain writes.
-- Retries within an operation are bounded by the workflow; explicit new attempts count again.
-- System backups are exempt so user traffic cannot prevent disaster recovery.
CREATE TRIGGER operations_usage_limits BEFORE INSERT ON operations
WHEN COALESCE(json_extract(NEW.input, '$.type'), '') <> 'database-backup'
BEGIN
  SELECT RAISE(ABORT, 'river_usage_owner_active') WHERE (
    SELECT COUNT(*) FROM operations
    WHERE owner_id = NEW.owner_id AND state IN ('Pending', 'Running')
      AND COALESCE(json_extract(input, '$.type'), '') <> 'database-backup'
  ) >= 4;
  SELECT RAISE(ABORT, 'river_usage_global_active') WHERE (
    SELECT COUNT(*) FROM operations WHERE state IN ('Pending', 'Running')
      AND COALESCE(json_extract(input, '$.type'), '') <> 'database-backup'
  ) >= 16;
  SELECT RAISE(ABORT, 'river_usage_owner_daily') WHERE (
    SELECT COUNT(*) FROM operations WHERE owner_id = NEW.owner_id
      AND created_at >= unixepoch('now', 'start of day') * 1000
      AND COALESCE(json_extract(input, '$.type'), '') <> 'database-backup'
  ) >= 100;
  SELECT RAISE(ABORT, 'river_usage_global_daily') WHERE (
    SELECT COUNT(*) FROM operations
    WHERE created_at >= unixepoch('now', 'start of day') * 1000
      AND COALESCE(json_extract(input, '$.type'), '') <> 'database-backup'
  ) >= 1000;
END;

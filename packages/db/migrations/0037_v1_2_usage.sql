-- Replace the old attempt-based daily limits; concurrency remains bounded for all processing.
DROP TRIGGER operations_usage_limits;
CREATE TRIGGER operations_usage_limits BEFORE INSERT ON operations
WHEN NEW.state IN ('Pending','Running') AND COALESCE(json_extract(NEW.input,'$.type'),'') <> 'database-backup'
BEGIN
  SELECT RAISE(ABORT,'river_usage_owner_active') WHERE (SELECT COUNT(*) FROM operations WHERE owner_id=NEW.owner_id AND state IN ('Pending','Running') AND COALESCE(json_extract(input,'$.type'),'') <> 'database-backup') >= 4;
  SELECT RAISE(ABORT,'river_usage_global_active') WHERE (SELECT COUNT(*) FROM operations WHERE state IN ('Pending','Running') AND COALESCE(json_extract(input,'$.type'),'') <> 'database-backup') >= 16;
END;
CREATE TABLE scoring_policy (id text PRIMARY KEY NOT NULL, daily_limit integer NOT NULL DEFAULT 25 CHECK(daily_limit BETWEEN 0 AND 10000), revision integer NOT NULL DEFAULT 0);
INSERT INTO scoring_policy(id) VALUES ('default');
CREATE TABLE scoring_account_policy (owner_id text PRIMARY KEY NOT NULL REFERENCES user(id), daily_limit integer CHECK(daily_limit BETWEEN 0 AND 10000), revision integer NOT NULL DEFAULT 0);
CREATE TABLE scoring_usage_days (owner_id text NOT NULL REFERENCES user(id), day text NOT NULL, used integer NOT NULL DEFAULT 0 CHECK(used >= 0), PRIMARY KEY(owner_id,day));
CREATE TABLE scoring_usage_reservations (id text PRIMARY KEY NOT NULL, owner_id text NOT NULL REFERENCES user(id), operation_id text NOT NULL REFERENCES operations(id), state text NOT NULL CHECK(state IN ('Reserved','Consumed','Released')), exempt integer NOT NULL DEFAULT 0, created_at integer NOT NULL, settled_at integer);
CREATE INDEX scoring_usage_owner_state ON scoring_usage_reservations(owner_id,state);
CREATE INDEX scoring_usage_operation ON scoring_usage_reservations(operation_id);
-- Account for existing retained successful results without rewriting them.
INSERT INTO scoring_usage_days(owner_id,day,used)
SELECT owner_id, day, COUNT(*) FROM (
  SELECT owner_id, date(json_extract(result,'$.receivedAt') / 1000,'unixepoch') AS day FROM scoring_runs WHERE result IS NOT NULL
  UNION ALL
  SELECT r.owner_id, date(f.received_at / 1000,'unixepoch') FROM template_scoring_fixtures f JOIN template_scoring_runs r ON r.id=f.run_id WHERE f.raw_response_json IS NOT NULL
) WHERE day IS NOT NULL GROUP BY owner_id,day;
-- Keep already-admitted work reserved when migration occurs while tasks are active.
INSERT INTO scoring_usage_reservations(id,owner_id,operation_id,state,created_at)
SELECT 'checkpoint:' || r.id,r.owner_id,r.operation_id,'Reserved',r.created_at FROM scoring_runs r JOIN operations o ON o.id=r.operation_id WHERE r.result IS NULL AND o.state IN ('Pending','Running');
INSERT INTO scoring_usage_reservations(id,owner_id,operation_id,state,created_at)
SELECT 'template:' || r.id || ':' || f.fixture_id,r.owner_id,r.operation_id,'Reserved',r.created_at FROM template_scoring_runs r JOIN template_scoring_fixtures f ON f.run_id=r.id JOIN operations o ON o.id=r.operation_id WHERE f.raw_response_json IS NULL AND o.state IN ('Pending','Running');
CREATE TRIGGER scoring_usage_settle AFTER UPDATE OF state ON scoring_usage_reservations
WHEN OLD.state='Reserved' AND NEW.state='Consumed'
BEGIN
  INSERT INTO scoring_usage_days(owner_id,day,used) VALUES (NEW.owner_id,strftime('%Y-%m-%d','now'),1)
  ON CONFLICT(owner_id,day) DO UPDATE SET used=used+1;
END;
CREATE TRIGGER scoring_usage_release AFTER UPDATE OF state ON operations
WHEN NEW.state IN ('Succeeded','Failed','Cancelled')
BEGIN
  UPDATE scoring_usage_reservations SET state='Released',settled_at=unixepoch('now')*1000 WHERE operation_id=NEW.id AND state='Reserved';
END;

CREATE TABLE workspace_records (
 id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL REFERENCES user(id),
 kind TEXT NOT NULL CHECK(kind IN ('context','fact','content','template','resume','version')),
 name TEXT NOT NULL, revision INTEGER NOT NULL CHECK(revision > 0), payload TEXT NOT NULL CHECK(json_valid(payload)),
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER
);
CREATE INDEX workspace_records_owner_kind ON workspace_records(owner_id,kind,updated_at);
CREATE TABLE workspace_record_revisions (
 id TEXT PRIMARY KEY NOT NULL, record_id TEXT NOT NULL REFERENCES workspace_records(id),
 revision INTEGER NOT NULL, payload TEXT NOT NULL CHECK(json_valid(payload)), actor_id TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX workspace_record_revision ON workspace_record_revisions(record_id,revision);
CREATE TABLE workspace_exports (
 id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL REFERENCES user(id), version_id TEXT NOT NULL REFERENCES workspace_records(id),
 object_key TEXT NOT NULL, metadata TEXT NOT NULL CHECK(json_valid(metadata)), state TEXT NOT NULL CHECK(state IN ('Prepared','Complete')),
 created_at INTEGER NOT NULL, completed_at INTEGER
);
CREATE INDEX workspace_exports_owner ON workspace_exports(owner_id,created_at);
CREATE TABLE workspace_archives (
 owner_id TEXT PRIMARY KEY NOT NULL REFERENCES user(id), version INTEGER NOT NULL, counts TEXT NOT NULL CHECK(json_valid(counts)), created_at INTEGER NOT NULL
);
CREATE TABLE workspace_archive_records (
 owner_id TEXT NOT NULL REFERENCES user(id), category TEXT NOT NULL, id TEXT NOT NULL, name TEXT NOT NULL,
 data TEXT NOT NULL CHECK(json_valid(data)), archived_at INTEGER NOT NULL,
 PRIMARY KEY(owner_id,category,id)
);
-- Historical and new captured versions are immutable. Restores create a draft revision.
CREATE TRIGGER workspace_version_immutable BEFORE UPDATE OF payload ON workspace_records
 WHEN OLD.kind = 'version' BEGIN SELECT RAISE(ABORT, 'Saved versions are immutable'); END;
CREATE TRIGGER workspace_export_immutable BEFORE UPDATE OF metadata,version_id,object_key ON workspace_exports
 BEGIN SELECT RAISE(ABORT, 'Export inputs are immutable'); END;
CREATE TRIGGER workspace_archive_immutable BEFORE UPDATE ON workspace_archive_records
 BEGIN SELECT RAISE(ABORT, 'Archives are read-only'); END;

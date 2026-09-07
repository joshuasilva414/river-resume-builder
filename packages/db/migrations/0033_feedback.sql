CREATE TABLE feedback (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL REFERENCES user(id),
  kind TEXT NOT NULL CHECK (kind IN ('Bug report', 'Feature request')),
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 160),
  description TEXT NOT NULL CHECK (length(trim(description)) BETWEEN 1 AND 12000),
  status TEXT NOT NULL DEFAULT 'New' CHECK (status IN ('New', 'In review', 'Planned', 'Resolved', 'Closed')),
  response TEXT NOT NULL DEFAULT '' CHECK (length(response) <= 4000),
  revision INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX feedback_owner_created_idx ON feedback(owner_id, created_at, id);
CREATE INDEX feedback_status_created_idx ON feedback(status, created_at, id);

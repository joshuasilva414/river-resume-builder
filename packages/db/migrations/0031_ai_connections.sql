CREATE TABLE ai_connections (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL REFERENCES user(id),
  provider TEXT NOT NULL CHECK(provider IN ('openai','anthropic','google','openrouter')),
  revision INTEGER NOT NULL DEFAULT 0,
  encrypted_key TEXT,
  key_suffix TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  removed_at INTEGER
);
CREATE UNIQUE INDEX ai_connection_active_provider ON ai_connections(owner_id, provider) WHERE removed_at IS NULL;
CREATE TABLE workspace_preferences (
  owner_id TEXT PRIMARY KEY NOT NULL REFERENCES user(id),
  revision INTEGER NOT NULL DEFAULT 0,
  data TEXT NOT NULL
);

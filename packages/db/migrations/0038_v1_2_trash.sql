-- Deletion is independent of validation/approval. Saved graphs remain renderable.
ALTER TABLE template_designs ADD COLUMN archived_at INTEGER;
CREATE INDEX template_designs_owner_trash ON template_designs(owner_id, archived_at);
CREATE INDEX sources_owner_trash ON sources(owner_id, archived_at);
CREATE INDEX library_owner_trash ON library_items(owner_id, archived_at);

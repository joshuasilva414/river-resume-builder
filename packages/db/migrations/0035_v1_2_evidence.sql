-- Historical material, decisions, references, and exported reports remain immutable.
-- Evidence usability no longer depends on the retained legacy review_state column.
UPDATE evidence_claims SET metadata = json_set(metadata, '$.type', 'Other')
WHERE json_extract(metadata, '$.type') IS NULL
   OR json_extract(metadata, '$.type') NOT IN ('Skill', 'Achievement', 'Experience', 'Education', 'Credential', 'Other');
ALTER TABLE sources ADD COLUMN archived_at integer;
ALTER TABLE sources ADD COLUMN extraction_ai text;

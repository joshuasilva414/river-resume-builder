-- Temporary cutover gate. Existing operations can finish; manual document work remains available.
CREATE TRIGGER IF NOT EXISTS river_v11_ai_admission_paused
BEFORE INSERT ON operations
WHEN json_extract(NEW.input, '$.type') IN (
  'job-ai', 'wording-ai', 'source-ai', 'duplicate-ai', 'template-ai', 'source-refinement'
)
BEGIN
  SELECT RAISE(ABORT, 'river_v11_ai_admission_paused');
END;

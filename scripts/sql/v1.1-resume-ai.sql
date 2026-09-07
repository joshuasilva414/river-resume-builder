-- Run only after the BYOK deployment is verified, or after an intentional rollback.
DROP TRIGGER IF EXISTS river_v11_ai_admission_paused;

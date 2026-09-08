-- Existing validation requests retain their historical review workflow.
ALTER TABLE template_validations ADD COLUMN approve_on_success INTEGER NOT NULL DEFAULT 0;

import { createRepository } from "@river/db";
import handler from "@tanstack/react-start/server-entry";
import { backupConfigured } from "./server/backup-export";
import type { Env } from "./server/env";
import { cleanRejectedSourceRefinements } from "./server/refinement-cleanup";
import { reconcileOperations } from "./server/services";
import { cleanRejectedTemplatePreviews } from "./server/template-ai-cleanup";

export { BackupWorkflow } from "./server/backup-workflow";
export { DocumentWorkflow } from "./server/document-workflow";
export { DuplicateAiWorkflow } from "./server/duplicate-ai-workflow";
export { JobAiWorkflow } from "./server/job-ai-workflow";
export { SourceRefinementWorkflow } from "./server/refinement-workflow";
export { ScoringWorkflow } from "./server/scoring-workflow";
export { SourceAiWorkflow } from "./server/source-ai-workflow";
export { TemplateAiWorkflow } from "./server/template-ai-workflow";
export { TemplateScoringWorkflow } from "./server/template-scoring-workflow";
export { TemplateValidationWorkflow } from "./server/template-validation-workflow";
export { WordingWorkflow } from "./server/wording-workflow";

export default {
  fetch: (request) => handler.fetch(request),
  async scheduled(event: ScheduledController, env: Env) {
    if (backupConfigured(env))
      await createRepository(env.DB).scheduleBackup(
        env.OWNER_EMAIL,
        new Date(event.scheduledTime).toISOString().slice(0, 10),
      );
    await reconcileOperations(env);
    await cleanRejectedTemplatePreviews(env);
    await cleanRejectedSourceRefinements(env);
  },
} satisfies ExportedHandler<Env>;

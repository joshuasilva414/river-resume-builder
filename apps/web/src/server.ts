import { createRepository } from "@river/db";
import handler from "@tanstack/react-start/server-entry";
import { backupConfigured } from "./server/backup-export";
import type { Env } from "./server/env";
import { secureRequest } from "./server/request-security";
import { reconcileOperations } from "./server/services";

export { BackupWorkflow } from "./server/backup-workflow";

export default {
  fetch: (request, env) => secureRequest(request, env, (secured) => handler.fetch(secured)),
  async scheduled(event: ScheduledController, env: Env) {
    if (backupConfigured(env))
      await createRepository(env.DB).scheduleBackup(
        env.ADMIN_EMAIL,
        new Date(event.scheduledTime).toISOString().slice(0, 10),
      );
    await reconcileOperations(env);
  },
} satisfies ExportedHandler<Env>;

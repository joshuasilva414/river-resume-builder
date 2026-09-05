import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { createRepository } from "@river/db";
import { BackupExport, backupCatalogQuery, canonicalJson, fingerprint } from "@river/domain";
import { Schema } from "effect";
import {
  backupConfigured,
  backupEnvironment,
  backupTargets,
  exportDatabase,
  retainBackupManifest,
  safeBackupFailure,
} from "./backup-export";
import type { Env } from "./env";

const migrationFiles = import.meta.glob<string>("../../../../packages/db/migrations/*.sql", {
  eager: true,
  query: "?raw",
  import: "default",
});
const persistenceStep = {
  retries: { limit: 2, delay: "5 seconds", backoff: "constant" },
  timeout: "30 seconds",
} as const;

export async function backupSchema(db: D1Database) {
  const names = (
    await db.prepare("SELECT name FROM d1_migrations ORDER BY id").all<{ name: string }>()
  ).results.map((row) => row.name);
  const tables = (await db.prepare(backupCatalogQuery).all<{ name: string }>()).results.map(
    (row) => row.name,
  );
  const migrations = [];
  for (const name of names) {
    const sql = migrationFiles[`../../../../packages/db/migrations/${name}`];
    if (!sql) throw new Error("A database migration is missing from this Worker version.");
    migrations.push({ name, sql, sha256: await fingerprint(sql) });
  }
  return { tables, migrations };
}

export class BackupWorkflow extends WorkflowEntrypoint<Env, { operationId: string }> {
  async run(event: WorkflowEvent<{ operationId: string }>, step: WorkflowStep) {
    const store = createRepository(this.env.DB),
      id = event.payload.operationId;
    try {
      const environment = backupEnvironment(this.env);
      if (!environment) throw new Error("Daily backup settings are unavailable.");
      const resources = backupTargets[environment];
      const captured = await step.do("capture-backup-schema", persistenceStep, async () => {
        if (!backupConfigured(this.env)) throw new Error("Daily backup settings are unavailable.");
        const operation = await store.getOperation(id);
        if (
          !operation ||
          !("type" in operation.input) ||
          operation.input.type !== "database-backup" ||
          !["Pending", "Running"].includes(operation.state)
        )
          return null;
        const backup = await store.getBackup(operation.input.date);
        if (!backup || backup.operationId !== id)
          throw new Error("Backup dispatch identity mismatch.");
        await store.updateOperation(id, {
          state: "Running",
          stage: "Exporting daily database snapshot",
        });
        return {
          ...(await backupSchema(this.env.DB)),
          date: operation.input.date,
          createdAt: new Date(backup.createdAt).toISOString(),
          environment,
          resources,
        };
      });
      if (!captured) return;
      // Previously captured Workflow steps were staging-only and omitted this resource tuple.
      if (
        (captured.environment ?? "staging") !== environment ||
        canonicalJson(captured.resources ?? backupTargets.staging) !== canonicalJson(resources)
      )
        throw new Error("Daily backup settings are unavailable.");
      const prefix = `backups/database/${environment}/${captured.date}-${id}`;
      const data = await step.do(
        "export-and-retain-sql",
        { retries: { limit: 2, delay: "10 seconds", backoff: "constant" }, timeout: "2 minutes" },
        () =>
          exportDatabase({
            environment,
            token: this.env.D1_EXPORT_API_TOKEN ?? "",
            tables: captured.tables,
            key: `${prefix}/data.sql`,
            bucket: this.env.ARTIFACTS,
          }),
      );
      const manifest = await step.do(
        "verify-schema-and-retain-manifest",
        persistenceStep,
        async () => {
          if (
            canonicalJson(await backupSchema(this.env.DB)) !==
            canonicalJson({ tables: captured.tables, migrations: captured.migrations })
          )
            throw new Error("Schema changed during backup; retry must capture the new schema.");
          const value = Schema.decodeUnknownSync(BackupExport)({
            format: "river-d1-export-v2",
            id,
            createdAt: captured.createdAt,
            resources,
            tables: captured.tables,
            migrations: captured.migrations,
            data,
          });
          return retainBackupManifest(
            this.env.ARTIFACTS,
            `${prefix}/manifest.json`,
            JSON.stringify(value),
          );
        },
      );
      await step.do("record-backup-completion", persistenceStep, () =>
        store.completeBackup(captured.date, id, manifest),
      );
    } catch (error) {
      await step.do("record-backup-failure", persistenceStep, () =>
        store.updateOperation(id, {
          state: "Failed",
          stage: "Daily database backup failed",
          failure: safeBackupFailure(error),
        }),
      );
      throw new Error(`Database backup operation ${id} failed`);
    }
  }
}

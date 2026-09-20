import { expect, it } from "vitest";
import targets from "../../../config/backup-resources.json";
import webConfiguration from "../wrangler.jsonc?raw";

const web = JSON.parse(webConfiguration);

it.each(["staging", "production"] as const)(
  "pins %s bindings and backup targets to the same personal resources",
  (environment) => {
    const target = targets[environment];
    const config = web.env[environment];
    expect(web.account_id).toBe(target.accountId);
    expect(config.vars).toMatchObject({
      ENVIRONMENT: environment,
      BACKUP_ACCOUNT_ID: target.accountId,
      BACKUP_DATABASE_ID: target.databaseId,
      BACKUP_BUCKET_NAME: target.bucket,
    });
    expect(config.d1_databases).toEqual([
      {
        binding: "DB",
        database_name: target.database,
        database_id: target.databaseId,
        migrations_dir: "../../packages/db/migrations",
      },
    ]);
    expect(config.r2_buckets).toEqual([{ binding: "ARTIFACTS", bucket_name: target.bucket }]);
    expect(config.workflows).toHaveLength(1);
    for (const workflow of config.workflows)
      expect(workflow.name).toMatch(new RegExp(`^river-${environment}-`));
  },
);

it("keeps production storage separate and exposes only the configured application domain", () => {
  expect(targets.production.databaseId).not.toBe(targets.staging.databaseId);
  expect(targets.production.bucket).not.toBe(targets.staging.bucket);
  expect(web.env.production.name).toBe("river-production");
  expect(web.env.production.workers_dev).toBe(false);
  expect(web.env.production.preview_urls).toBe(false);
  expect(web.env.production.vars.APP_URL).toBe("https://river.jilva.dev");
  expect(web.env.production.routes).toEqual([{ pattern: "river.jilva.dev", custom_domain: true }]);
});

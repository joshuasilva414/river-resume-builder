import assert from "node:assert/strict";
import { deploymentTarget, readJson, run, validateBundle } from "./lib/deployment.mjs";

assert.equal(process.argv.length, 3, "Use: pnpm ci:deploy staging|production");
const target = deploymentTarget(process.argv[2]);
const source = await readJson("apps/web/wrangler.jsonc");
const bundle = await readJson("apps/web/dist/server/wrangler.json");
const documents = await readJson("apps/documents/wrangler.jsonc");
validateBundle(bundle, source, target);
assert.equal(documents.account_id, source.account_id);
assert.equal(documents.env[target.environment].name, `river-documents-${target.environment}`);
assert.equal(
  bundle.services.find((service) => service.binding === "DOCUMENTS").service,
  documents.env[target.environment].name,
);

await run([`backup:${target.environment}`], { CLOUDFLARE_ENV: undefined });
await run(
  [
    "--filter",
    "@river/web",
    "exec",
    "wrangler",
    "d1",
    "migrations",
    "apply",
    bundle.d1_databases.find((database) => database.binding === "DB").database_name,
    "--remote",
    "--env",
    target.environment,
  ],
  { CLOUDFLARE_ENV: undefined },
);

// This is the private companion Worker, not the web Worker attached to Workers Builds.
// Keep Cloudflare's name/tag guards for the web deploy; remove them only for this command.
await run(
  ["--filter", "@river/documents", "exec", "wrangler", "deploy", "--env", target.environment],
  {
    CLOUDFLARE_ENV: undefined,
    WRANGLER_CI_MATCH_TAG: undefined,
    WRANGLER_CI_OVERRIDE_NAME: undefined,
  },
);
await run(
  ["--filter", "@river/web", "exec", "wrangler", "deploy", "--config", "dist/server/wrangler.json"],
  { CLOUDFLARE_ENV: undefined },
);

for (const [path, expected] of [
  ["/sign-in", 200],
  ["/api/v1/me", 401],
]) {
  const response = await fetch(new URL(path, bundle.vars.APP_URL), {
    redirect: "manual",
    signal: AbortSignal.timeout(30_000),
  });
  assert.equal(response.status, expected, `Post-deploy check failed: ${path}`);
}
console.log(`Deployed ${target.worker}; sign-in and anonymous API protection checks passed.`);

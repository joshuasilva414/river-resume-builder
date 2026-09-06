import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { deploymentTarget, readJson, root, run, validateBundle } from "./lib/deployment.mjs";

const [environment, mode] = process.argv.slice(2);
assert.ok(process.argv.length <= 4 && (!mode || mode === "--bundle-only"));
const target = deploymentTarget(environment);
// Tests use local bindings even when the hosted build selects a release environment.
if (!mode) {
  for (const command of ["lint", "check", "test", "test:deployment", "test:documents"]) {
    await run([command], { CLOUDFLARE_ENV: undefined });
  }
}
await rm(join(root, "apps/web/dist"), { recursive: true, force: true });
await run(["--filter", "@river/web", "build"], { CLOUDFLARE_ENV: environment });
validateBundle(
  await readJson("apps/web/dist/server/wrangler.json"),
  await readJson("apps/web/wrangler.jsonc"),
  target,
);
await run(
  [
    "--filter",
    "@river/web",
    "exec",
    "wrangler",
    "deploy",
    "--config",
    "dist/server/wrangler.json",
    "--dry-run",
  ],
  { CLOUDFLARE_ENV: undefined },
);
console.log(`Validated ${target.worker} bundle.`);

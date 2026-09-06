import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const root = fileURLToPath(new URL("../../", import.meta.url));

export function deploymentTarget(environment, variables = process.env) {
  assert.ok(
    environment === "staging" || environment === "production",
    "Choose staging or production explicitly; dev has no hosted deployment.",
  );
  const branch = environment === "production" ? "main" : "staging";
  if (variables.WORKERS_CI || variables.WORKERS_CI_BRANCH) {
    assert.equal(variables.WORKERS_CI_BRANCH, branch, "Build branch does not match environment.");
  }
  return { environment, branch, worker: `river-${environment}` };
}

export async function readJson(path) {
  return JSON.parse(await readFile(join(root, path), "utf8"));
}

/** Reject stale or incorrectly targeted Vite output before any remote writes. */
export function validateBundle(bundle, source, target) {
  const expected = source.env[target.environment];
  assert.equal(bundle.account_id, source.account_id);
  assert.equal(bundle.name, target.worker);
  for (const key of ["vars", "d1_databases", "r2_buckets", "services", "workflows", "routes"]) {
    // Vite resolves migration paths relative to the generated configuration.
    if (key === "d1_databases") {
      const identities = (databases) =>
        databases.map(({ binding, database_name, database_id }) => ({
          binding,
          database_name,
          database_id,
        }));
      assert.deepEqual(identities(bundle[key]), identities(expected[key]));
    } else {
      assert.deepEqual(bundle[key] ?? [], expected[key] ?? []);
    }
  }
  if (target.environment === "production") {
    assert.equal(bundle.workers_dev, false);
    assert.equal(bundle.preview_urls, false);
  }
}

/** Run from the repository root without a shell; stop immediately on failure. */
export async function run(args, overrides = {}) {
  const env = { ...process.env, ...overrides };
  for (const [key, value] of Object.entries(env)) if (value === undefined) delete env[key];
  console.log(`pnpm ${args.join(" ")}`);
  await new Promise((resolve, reject) => {
    const child = spawn("pnpm", args, { cwd: root, env, stdio: "inherit" });
    child.once("error", reject);
    child.once("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`pnpm ${args[0]} failed (${code}).`)),
    );
  });
}

import assert from "node:assert/strict";
import { test } from "node:test";
import { deploymentTarget, readJson, validateBundle } from "./deployment.mjs";

const source = await readJson("apps/web/wrangler.jsonc");
const bundleFor = (environment) => ({
  account_id: source.account_id,
  observability: structuredClone(source.observability),
  ...structuredClone(source.env[environment]),
});

test("hosted builds reject dev, missing branches, and cross-environment deployment", () => {
  assert.throws(() => deploymentTarget("dev", {}));
  assert.throws(() => deploymentTarget("production", { WORKERS_CI: "1" }));
  assert.throws(() => deploymentTarget("production", { WORKERS_CI_BRANCH: "staging" }));
  assert.throws(() => deploymentTarget("staging", { WORKERS_CI_BRANCH: "main" }));
  assert.equal(
    deploymentTarget("production", { WORKERS_CI_BRANCH: "main" }).worker,
    "river-production",
  );
});

test("rejects a stale staging bundle or production bundle with foreign storage", () => {
  const target = deploymentTarget("production", {});
  assert.throws(() => validateBundle(bundleFor("staging"), source, target));
  for (const key of ["d1_databases", "r2_buckets", "services", "workflows", "routes"]) {
    const bundle = bundleFor("production");
    bundle[key] = source.env.staging[key];
    assert.throws(() => validateBundle(bundle, source, target), key);
  }
  const bundle = bundleFor("production");
  bundle.workers_dev = true;
  assert.throws(() => validateBundle(bundle, source, target));
});

test("accepts correct environment bindings with Vite-resolved migration paths", () => {
  for (const environment of ["staging", "production"]) {
    const bundle = bundleFor(environment);
    bundle.d1_databases[0].migrations_dir = "/build/packages/db/migrations";
    validateBundle(bundle, source, deploymentTarget(environment, {}));
  }
});

test("rejects bundles that persist unsanitized URL metadata or omit the sanitizer", () => {
  for (const modify of [
    (bundle) => { bundle.observability.logs.persist = true; },
    (bundle) => { bundle.observability.redact_query_string = false; },
    (bundle) => { bundle.tail_consumers = []; },
  ]) {
    const bundle = bundleFor("production");
    modify(bundle);
    assert.throws(() => validateBundle(bundle, source, deploymentTarget("production", {})));
  }
});

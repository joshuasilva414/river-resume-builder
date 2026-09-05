import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => ({
  plugins: [
    cloudflareTest({
      miniflare: {
        compatibilityDate: "2026-08-22",
        compatibilityFlags: ["nodejs_compat"],
        d1Databases: ["DB"],
        r2Buckets: ["ARTIFACTS"],
        bindings: { TEST_MIGRATIONS: await readD1Migrations("../../packages/db/migrations") },
      },
    }),
  ],
  test: { include: ["test/**/*.test.ts"], fileParallelism: false, testTimeout: 20_000 },
}));

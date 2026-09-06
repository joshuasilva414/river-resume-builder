import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => ({
  plugins: [
    cloudflareTest({
      main: "./test/workflow-entry.ts",
      miniflare: {
        compatibilityDate: "2026-08-22",
        compatibilityFlags: ["nodejs_compat"],
        d1Databases: ["DB"],
        r2Buckets: ["ARTIFACTS"],
        workflows: { DOCUMENT_WORKFLOW: { name: "test-documents", className: "DocumentWorkflow" } },
        serviceBindings: { DOCUMENTS: { name: "test-document-adapter", entrypoint: "Documents" } },
        workers: [
          {
            name: "test-document-adapter",
            compatibilityDate: "2026-08-22",
            modules: true,
            script: `import { WorkerEntrypoint } from 'cloudflare:workers';
            export class Documents extends WorkerEntrypoint {
              async run(input) {
                if (input.type !== 'extract-source') throw new Error('Unexpected fixture job');
                const text = atob(input.contentBase64);
                return { type: 'extracted', text, segments: [{ text, start: 0, end: text.length }], parser: 'fixture', parserVersion: '1' };
              }
            }`,
          },
        ],
        bindings: { TEST_MIGRATIONS: await readD1Migrations("../../packages/db/migrations") },
      },
    }),
  ],
  test: {
    include: ["test/**/*.test.ts"],
    setupFiles: ["./test/setup.ts"],
    fileParallelism: false,
    testTimeout: 20_000,
  },
}));

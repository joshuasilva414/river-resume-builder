import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(resolve(root, "apps/documents/package.json"));
const { build } = await import(pathToFileURL(require.resolve("esbuild")).href);
const output = resolve(root, "test-results/v1.2.1-tools/prepare.mjs");
await build({
  entryPoints: [resolve(root, "scripts/evaluation/prepare-resume-quality.ts")],
  outfile: output,
  bundle: true,
  platform: "node",
  format: "esm",
  plugins: [
    {
      name: "river-evaluation",
      setup(builder) {
        builder.onResolve({ filter: /^@river\// }, (args) => ({
          path: resolve(root, "packages", args.path.slice(7), "src/index.ts"),
        }));
        builder.onResolve({ filter: /^effect(?:\/.*)?$/ }, (args) => ({
          path: require.resolve(args.path),
        }));
      },
    },
  ],
});
await import(pathToFileURL(output).href);

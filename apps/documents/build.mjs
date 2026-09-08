import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

await build({
  entryPoints: ["src/process-job.ts", "src/fixture.ts", "src/compile-cache.ts"],
  outdir: "dist",
  outExtension: { ".js": ".mjs" },
  platform: "node",
  format: "esm",
  bundle: true,
  packages: "external",
  external: ["pdfjs-dist/*", "mammoth"],
  plugins: [
    {
      name: "river-workspaces",
      setup(build) {
        build.onResolve({ filter: /^@river\// }, (args) => ({
          path: fileURLToPath(
            new URL(`../../packages/${args.path.slice(7)}/src/index.ts`, import.meta.url),
          ),
        }));
      },
    },
  ],
});
await mkdir("dist", { recursive: true });
await writeFile(
  "dist/build.json",
  JSON.stringify({ compiler: "tectonic@0.17.0", renderer: "river-tectonic-0.4.0" }),
);

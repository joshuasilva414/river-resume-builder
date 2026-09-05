import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

await build({
  entryPoints: ["src/process-job.ts"],
  outfile: "dist/process-job.mjs",
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
await build({
  stdin: {
    contents:
      'import {syntheticResume,fixedPack,validateGraph} from "@river/templates"; import {allTypesDocument,templateFixtures} from "../../packages/templates/src/fixtures"; import {writeFileSync} from "node:fs"; const base=fixedPack("classic"); const customGraph=validateGraph({...base,document:{...base.document,manifest:{...base.document.manifest,overrides:{font:"Latin Modern Sans",bodySize:9}}},sections:base.sections.map(t=>t.manifest.contentTypes.includes("summary")?{...t,manifest:{...t.manifest,overrides:{font:"Latin Modern Roman",bodySize:11,sectionSpacing:18}}}:t),blocks:fixedPack("minimal").blocks}); writeFileSync(process.argv[2] ?? "/app/fixture.json", JSON.stringify({type:"compile-resume",jobId:"warmup",theme:"classic",document:syntheticResume,allTypesDocument,customGraph,templateFixtures}));',
    resolveDir: process.cwd(),
  },
  outfile: "dist/fixture.mjs",
  platform: "node",
  format: "esm",
  bundle: true,
  packages: "external",
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
await writeFile(
  "dist/build.json",
  JSON.stringify({ compiler: "tectonic@0.17.0", renderer: "river-tectonic-0.2.0" }),
);

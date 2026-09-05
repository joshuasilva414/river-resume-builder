import { writeFileSync } from "node:fs";
import {
  captureAtsFixtureSet,
  fixedPack,
  syntheticResume,
  templateFixtures,
  validateGraph,
} from "@river/templates";
import { allTypesDocument } from "../../../packages/templates/src/fixtures";

const base = fixedPack("classic");
const customGraph = validateGraph({
  ...base,
  document: {
    ...base.document,
    manifest: { ...base.document.manifest, overrides: { font: "Latin Modern Sans", bodySize: 9 } },
  },
  sections: base.sections.map((template) =>
    template.manifest.contentTypes.includes("summary")
      ? {
          ...template,
          manifest: {
            ...template.manifest,
            overrides: { font: "Latin Modern Roman", bodySize: 11, sectionSpacing: 18 },
          },
        }
      : template,
  ),
  blocks: fixedPack("minimal").blocks,
});

writeFileSync(
  process.argv[2] ?? "/app/fixture.json",
  JSON.stringify({
    type: "compile-resume",
    jobId: "warmup",
    theme: "classic",
    document: syntheticResume,
    allTypesDocument,
    customGraph,
    templateFixtures,
    atsFixtureSet: await captureAtsFixtureSet(),
    fixedGraphs: Object.fromEntries(
      (["classic", "minimal", "technical"] as const).map((theme) => [
        theme,
        validateGraph(fixedPack(theme)),
      ]),
    ),
  }),
);

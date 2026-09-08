import {
  blockDefinitions,
  type Composition,
  contentTypes,
  type LibraryData,
  type LibraryGraphNode,
  placeSection,
  renderComposition,
} from "@river/domain";

let identity = 0;
const id = () => `00000000-0000-7000-8000-${String(++identity).padStart(12, "0")}`;
const graph: LibraryGraphNode[] = [];
function add(data: LibraryData) {
  const itemId = id(),
    revisionId = id();
  graph.push({
    item: { id: itemId, currentRevisionId: revisionId },
    revision: { id: revisionId, data },
  });
  return { itemId, revisionId };
}
const headings = {
  contact: "",
  summary: "Summary",
  experience: "Experience",
  project: "Projects",
  education: "Education",
  skill: "Technical skills",
  credential: "Credentials",
} as const;
const references = contentTypes.map((type) => {
  const fields = blockDefinitions[type].fields.map((field) => ({
    key: field.key,
    contents: Array.from(
      { length: field.key === "bullets" || field.key === "items" ? 2 : 1 },
      (_, index) => ({
        id: id(),
        ...add({
          kind: "content",
          type,
          wording:
            type === "contact" && field.key === "name"
              ? "Synthetic Person"
              : field.key === "bullets"
                ? `Repeated ${type} evidence: Café, 25% & C#; $500, {value}, x_1.`
                : `${type} ${field.key} ${index + 1}: synthetic fixture`,
          evidence: [],
        }),
      }),
    ),
  }));
  const block = add({ kind: "block", type, fields });
  return add({ kind: "section", type, heading: headings[type], blocks: [{ id: id(), ...block }] });
});
export const allTypesComposition: Composition = {
  name: "All seven types",
  theme: "classic",
  templateRevision: 2,
  sections: references.map((reference) => placeSection(reference, graph, id)),
};
export const allTypesGraph: readonly LibraryGraphNode[] = graph;
export const allTypesDocument = renderComposition(allTypesComposition, graph);

export const TEMPLATE_FIXTURE_VERSION = "river-template-fixtures-v1";
/** Canonical synthetic inputs never query evidence or resume storage. Placement IDs are deterministic. */
export const templateFixtures = [
  { id: "all-types", name: "All seven content types", document: allTypesDocument },
  {
    id: "unicode",
    name: "Unicode and escaped special characters",
    document: {
      name: "Zoë Núñez",
      contact: ["synthetic@example.test"],
      sections: [
        {
          type: "summary" as const,
          heading: "Summary",
          blocks: [
            {
              type: "summary" as const,
              heading: "",
              detail: "",
              paragraphs: ["Café, José, naïve — 25% & C#; $500, snake_case, {value}, ~home, x^2."],
              bullets: [],
            },
          ],
        },
      ],
    },
  },
  {
    id: "long-content",
    name: "Long content and page flow",
    document: {
      name: "Synthetic Person",
      contact: [],
      sections: [
        {
          type: "summary" as const,
          heading: "Long summary",
          blocks: [
            {
              type: "summary" as const,
              heading: "",
              detail: "",
              paragraphs: Array.from(
                { length: 80 },
                (_, i) =>
                  `Entry ${i + 1}. Repeated synthetic evidence remains in the required reading order.`,
              ),
              bullets: [],
            },
          ],
        },
      ],
    },
  },
  {
    id: "repeated-order",
    name: "Repeated wording and ordering",
    document: {
      name: "Synthetic Person",
      contact: [],
      sections: [
        {
          type: "project" as const,
          heading: "Projects",
          blocks: [
            {
              type: "project" as const,
              heading: "First project",
              detail: "Synthetic detail",
              paragraphs: ["Repeated passage.", "Middle passage.", "Repeated passage."],
              bullets: ["First bullet.", "Second bullet."],
            },
            {
              type: "project" as const,
              heading: "Second project",
              detail: "",
              paragraphs: ["Final passage."],
              bullets: [],
            },
          ],
        },
      ],
    },
  },
] as const;

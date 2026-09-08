import { builtInLayoutSource } from "./content-layouts";
import type {
  ContentSchema,
  ContentSchemaField,
  SchemaBundle,
  StructuredContent,
} from "./content-schema";
import { captureSchemaBundle } from "./content-schema";

export const BUILT_IN_CONTENT_REVISION = 2;

const text = (id: string, label: string, required = false): ContentSchemaField => ({
  id,
  label,
  required,
  kind: "text",
});
const date = (id: string, label: string): ContentSchemaField => ({
  id,
  label,
  required: false,
  kind: "date",
});
const list = (id: string, label: string, items: "text" | "skill" = "text"): ContentSchemaField => ({
  id,
  label,
  required: false,
  kind: "list",
  items,
});
const ref = (id: string) => ({ id, revision: BUILT_IN_CONTENT_REVISION });
const schema = (
  id: string,
  name: string,
  level: "entry" | "section",
  fields: readonly ContentSchemaField[],
): ContentSchema => ({ id, revision: BUILT_IN_CONTENT_REVISION, name, level, fields });
const entries = [
  schema("experience-entry", "Experience Entry", "entry", [
    text("employer", "Employer", true),
    text("title", "Title", true),
    text("location", "Location"),
    date("startDate", "Start date"),
    date("endDate", "End date"),
    list("accomplishments", "Accomplishments"),
  ]),
  schema("project-entry", "Project Entry", "entry", [
    text("project", "Project", true),
    text("description", "Description"),
    text("url", "Project link"),
    date("startDate", "Start date"),
    date("endDate", "End date"),
    list("accomplishments", "Accomplishments"),
  ]),
  schema("education-entry", "Education Entry", "entry", [
    text("institution", "Institution", true),
    text("degree", "Degree", true),
    text("fieldOfStudy", "Field of study"),
    { id: "gpa", label: "GPA", required: false, kind: "number" },
    date("startDate", "Start date"),
    date("endDate", "End date"),
    list("details", "Details"),
  ]),
  schema("credential-entry", "Credential Entry", "entry", [
    text("credential", "Credential", true),
    text("issuer", "Issuer"),
    date("issuedDate", "Issued date"),
    date("expirationDate", "Expiration date"),
    text("url", "Credential link"),
    list("details", "Details"),
  ]),
  schema("contact-link", "Contact Link", "entry", [
    text("url", "URL", true),
    text("label", "Display text"),
  ]),
];
const entrySection = (id: string, name: string): ContentSchema =>
  schema(`${id}-section`, name, "section", [
    text("heading", "Heading", true),
    {
      id: "entries",
      label: "Entries",
      required: false,
      kind: "records",
      schema: ref(`${id}-entry`),
      defaultLayout: ref(`${id}-entry-classic`),
    },
  ]);
const sections = [
  schema("summary-section", "Summary", "section", [
    text("heading", "Heading", true),
    text("summary", "Summary text", true),
  ]),
  schema("skills-section", "Skills", "section", [
    text("heading", "Heading", true),
    list("skills", "Skills", "skill"),
  ]),
  schema("contact-section", "Contact", "section", [
    text("name", "Name", true),
    text("email", "Email"),
    text("phone", "Phone"),
    text("location", "Location"),
    {
      id: "links",
      label: "Links",
      required: false,
      kind: "records",
      schema: ref("contact-link"),
      defaultLayout: ref("contact-link-classic"),
    },
  ]),
  entrySection("experience", "Experience"),
  entrySection("project", "Projects"),
  entrySection("education", "Education"),
  entrySection("credential", "Credentials"),
];
export const builtInSchemaBundle: SchemaBundle = {
  version: 2,
  schemas: [...entries, ...sections],
  layouts: [...entries, ...sections].flatMap((definition) => {
    const source = builtInLayoutSource(definition.id, "classic");
    return [
      {
        id: `${definition.id}-classic`,
        revision: BUILT_IN_CONTENT_REVISION,
        name: "Classic",
        schema: ref(definition.id),
        source,
      },
      ...(definition.level === "entry"
        ? [
            {
              id: `${definition.id}-compact`,
              revision: BUILT_IN_CONTENT_REVISION,
              name: "Compact",
              schema: ref(definition.id),
              source: builtInLayoutSource(definition.id, "compact"),
            },
          ]
        : []),
    ];
  }),
};
export function emptyStructuredContent(
  type: "contact" | "summary" | "experience" | "project" | "education" | "skill" | "credential",
  id: string,
): StructuredContent {
  const schemaId = `${type === "skill" ? "skills" : type}-section`;
  const definition = sections.find((item) => item.id === schemaId);
  if (!definition) throw new Error("Unknown section schema.");
  return {
    ...captureSchemaBundle(builtInSchemaBundle, ref(schemaId)),
    record: {
      id,
      schema: ref(schemaId),
      layout: ref(`${schemaId}-classic`),
      values: type === "contact" ? {} : { heading: definition.name },
    },
    evidence: [],
  };
}

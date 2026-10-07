import { blankResume } from "./content";
import {
  type EntryDefinition,
  type LayoutNode,
  newIdentity,
  type TemplateField,
  type ValueKind,
  type VisualStyle,
  type VisualTemplate,
} from "./model";

const field = (
  key: string,
  label: string,
  type: ValueKind | "group" = "text",
  extra: Partial<TemplateField> = {},
): TemplateField => ({
  id: newIdentity(),
  key,
  label,
  type,
  repeat: false,
  required: false,
  prefix: "",
  suffix: "",
  separator: "",
  dateFormat: "short",
  ...extra,
});
const slot = (fieldKey: string, style: VisualStyle = {}): LayoutNode => ({
  kind: "field",
  id: newIdentity(),
  fieldKey,
  style,
});
const row = (children: LayoutNode[], separator?: string): LayoutNode => ({
  kind: "row",
  id: newIdentity(),
  style: { gap: 6 },
  children,
  separator,
});
const column = (children: LayoutNode[], style: VisualStyle = {}): LayoutNode => ({
  kind: "column",
  id: newIdentity(),
  style: { gap: 4, ...style },
  children,
});
const heading = (text: string): LayoutNode => ({
  kind: "literal",
  id: newIdentity(),
  text,
  style: { fontFamily: "serif", fontSize: 15, borderBottom: true, padding: 3 },
});
export function standardTemplate(): VisualTemplate {
  const experience: EntryDefinition = {
    id: "experience",
    label: "Experience entry",
    fields: [
      field("employer", "Employer"),
      field("role", "Role"),
      field("start", "Start date", "date"),
      field("end", "End date", "date"),
      field("location", "Location"),
      field("highlights", "Accomplishment", "bullet", { repeat: true }),
    ],
    layout: column(
      [
        row([
          slot("employer", { weight: "bold", grow: 1 }),
          row([slot("start"), slot("end")], " – "),
        ]),
        slot("role"),
        slot("location"),
        slot("highlights"),
      ],
      { gap: 4 },
    ),
  };
  const education: EntryDefinition = {
    id: "education",
    label: "Education entry",
    fields: [
      field("institution", "Institution"),
      field("degree", "Degree"),
      field("start", "Start date", "date"),
      field("end", "End date", "date"),
      field("gpa", "GPA", "number", { prefix: "GPA: " }),
      field("details", "Detail", "bullet", { repeat: true }),
    ],
    layout: column([
      row([
        slot("institution", { weight: "bold", grow: 1 }),
        row([slot("start"), slot("end")], " – "),
      ]),
      slot("degree"),
      slot("gpa"),
      slot("details"),
    ]),
  };
  const contact: EntryDefinition = {
    id: "contact",
    label: "Contact",
    fields: [
      field("name", "Name", "text", { required: true }),
      field("location", "Location"),
      field("email", "Email", "link"),
      field("phone", "Phone"),
      field("links", "Link", "link", { repeat: true, separator: " · " }),
    ],
    layout: column([
      slot("name", { fontFamily: "serif", fontSize: 28 }),
      row([slot("location"), slot("email"), slot("phone")], " · "),
      slot("links"),
    ]),
  };
  const summary: EntryDefinition = {
    id: "summary",
    label: "Summary",
    fields: [field("summary", "Summary")],
    layout: column([heading("Summary"), slot("summary")]),
  };
  const experiences: EntryDefinition = {
    id: "experiences",
    label: "Experience",
    fields: [
      field("entries", "Experience entry", "group", { repeat: true, definitionId: experience.id }),
    ],
    layout: column([heading("Experience"), slot("entries", { gap: 12 })]),
  };
  const educations: EntryDefinition = {
    id: "educations",
    label: "Education",
    fields: [
      field("entries", "Education entry", "group", { repeat: true, definitionId: education.id }),
    ],
    layout: column([heading("Education"), slot("entries", { gap: 12 })]),
  };
  const skills: EntryDefinition = {
    id: "skills",
    label: "Skills",
    fields: [field("skills", "Skill", "skill", { repeat: true, separator: " · " })],
    layout: column([heading("Skills"), slot("skills")]),
  };
  return {
    version: 1,
    name: "Editorial",
    page: { size: "LETTER", margin: 36 },
    style: { fontFamily: "sans", fontSize: 10, color: "#17191f", gap: 12 },
    definitions: [contact, summary, experiences, experience, educations, education, skills],
    sections: [contact, summary, experiences, educations, skills].map((definition) => ({
      id: newIdentity(),
      key: definition.id,
      label: definition.label,
      definitionId: definition.id,
    })),
  };
}
/** Fictional renderer fixtures are isolated from all candidate persistence. */
export function renderingFixture(count = 3) {
  const template = standardTemplate();
  const resume = blankResume(
    template,
    "fictional-rendering-fixture",
    1,
    "Fictional rendering fixture",
  );
  const contact = resume.sections[0];
  if (contact?.kind === "group")
    contact.children = [
      {
        kind: "field",
        id: newIdentity(),
        key: "name",
        label: "Name",
        factIds: [],
        value: { kind: "text", value: [{ text: "Maya Chen" }] },
      },
      {
        kind: "field",
        id: newIdentity(),
        key: "email",
        label: "Email",
        factIds: [],
        value: {
          kind: "link",
          value: { label: "maya@example.com", href: "mailto:maya@example.com" },
        },
      },
    ];
  const section = resume.sections.find((item) => item.key === "experiences");
  if (section?.kind === "group")
    section.children = Array.from({ length: count }, (_, i) => ({
      kind: "group",
      id: newIdentity(),
      key: "entries",
      label: `Experience ${i + 1}`,
      definitionId: "experience",
      children: [
        {
          kind: "field",
          id: newIdentity(),
          key: "employer",
          label: "Employer",
          factIds: [],
          value: { kind: "text", value: [{ text: `Northstar Studio ${i + 1}`, bold: true }] },
        },
        {
          kind: "field",
          id: newIdentity(),
          key: "role",
          label: "Role",
          factIds: [],
          value: { kind: "text", value: [{ text: "Product engineer", italic: true }] },
        },
        {
          kind: "field",
          id: newIdentity(),
          key: "start",
          label: "Start",
          factIds: [],
          value: { kind: "date", value: { precision: "month", year: 2024, month: 2 } },
        },
        {
          kind: "field",
          id: newIdentity(),
          key: "end",
          label: "End",
          factIds: [],
          value: { kind: "date", value: { precision: "present" } },
        },
        {
          kind: "field",
          id: newIdentity(),
          key: "highlights",
          label: "Accomplishment",
          factIds: [],
          value: {
            kind: "bullet",
            value: [
              { text: "Built accessible interfaces for cafés and community organizations. " },
              { text: "Project details", href: "https://example.com", bold: true, italic: true },
            ],
          },
        },
      ],
    }));
  return resume;
}

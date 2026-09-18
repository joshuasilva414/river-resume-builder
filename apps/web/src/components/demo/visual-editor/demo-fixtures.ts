/** DEMO ONLY: all people, employers, jobs, and alternatives below are fictional; no library/API reads. */
import {
  type DemoLayoutNode,
  type DemoLayouts,
  type DemoRecord,
  type DemoState,
  type DemoStyle,
  demoBaseStyle,
  demoDefaultSectionOrder,
  demoNewId,
  demoReference,
  demoSchema,
  demoSchemas,
} from "./demo-model";

export const demoJobs = {
  product: {
    title: "Product Engineer",
    company: "Fieldwork",
    description:
      "Build accessible products with React, TypeScript, and API integrations. Work closely with design and support clear onboarding experiences.",
  },
  implementation: {
    title: "Implementation Engineer",
    company: "Waypoint",
    description:
      "Connect customer systems with REST APIs, troubleshoot integrations, and write clear technical documentation for customer handoffs.",
  },
};
export function demoMakeRecord(
  schemaId: string,
  id: string,
  values: Record<string, string | string[]> = {},
  children: Record<string, DemoRecord[]> = {},
): DemoRecord {
  const record: DemoRecord = { id, schema: demoReference(schemaId), values: {}, children: {} };
  for (const field of demoSchema(schemaId).fields) {
    if (field.kind === "records" || field.kind === "record")
      record.children[field.id] = children[field.id] ?? [];
    else {
      const value = values[field.id];
      record.values[field.id] =
        field.kind === "list"
          ? (Array.isArray(value) ? value : []).map((text, index) => ({
              id: `${id}-${field.id}-${index}`,
              text,
            }))
          : typeof value === "string"
            ? value
            : "";
    }
  }
  return record;
}
/** Empty list items provide a typing target; labels remain placeholders, never saved text. */
export function demoEmptyRecord(schemaId: string, id = demoNewId()): DemoRecord {
  const emptyLists = Object.fromEntries(
    demoSchema(schemaId)
      .fields.filter((field) => field.kind === "list")
      .map((field) => [field.id, [""]]),
  );
  return demoMakeRecord(schemaId, id, emptyLists);
}
export const demoLibrary = [
  demoMakeRecord("experience-entry", "demo-northstar", {
    employer: "Northstar Studio",
    title: "Software Engineer",
    startDate: "2024",
    endDate: "2026",
    accomplishments: [
      "Built an accessible onboarding flow with React and TypeScript.",
      "Connected customer workflows to a REST API.",
    ],
  }),
  demoMakeRecord("experience-entry", "demo-civic", {
    employer: "Civic Tools",
    title: "Software Engineering Intern",
    startDate: "2023",
    endDate: "2024",
    accomplishments: [
      "Implemented keyboard navigation and form validation for a public services portal.",
      "Documented API setup steps and common integration errors for the support team.",
    ],
  }),
  demoMakeRecord("experience-entry", "demo-wayfinder", {
    employer: "Wayfinder Labs",
    title: "Integration Developer",
    startDate: "2022",
    endDate: "2023",
    accomplishments: [
      "Built a REST API connector to synchronize customer records between two systems.",
      "Wrote troubleshooting guides and led walkthroughs with customer-facing teams.",
    ],
  }),
  demoMakeRecord("education-entry", "demo-lakeside", {
    institution: "Lakeside University",
    degree: "B.S. Computer Science",
    startDate: "2020",
    endDate: "2024",
  }),
  demoMakeRecord("education-entry", "demo-central", {
    institution: "Central Design Institute",
    degree: "Certificate, Interaction Design",
    endDate: "2025",
  }),
  demoMakeRecord("education-entry", "demo-harbor", {
    institution: "Harbor Technical College",
    degree: "Certificate, Web Accessibility",
    endDate: "2026",
    details: ["Practical study of semantic HTML, keyboard navigation, and accessible forms."],
  }),
];
export function demoSeedSections(): DemoRecord[] {
  return [
    demoMakeRecord("contact-section", "demo-contact", {
      name: "Maya Chen",
      email: "maya@example.com",
      location: "Austin, TX",
    }),
    demoMakeRecord("summary-section", "demo-summary", {
      heading: "Summary",
      summary:
        "Software engineer building thoughtful tools for people and teams. Experienced in accessible interfaces and API integrations.",
    }),
    demoMakeRecord(
      "experience-section",
      "demo-experience",
      { heading: "Experience" },
      { entries: structuredClone(demoLibrary.filter((record) => record.id === "demo-northstar")) },
    ),
    demoMakeRecord(
      "education-section",
      "demo-education",
      { heading: "Education" },
      {
        entries: structuredClone(
          demoLibrary.filter(
            (record) => record.id === "demo-lakeside" || record.id === "demo-central",
          ),
        ),
      },
    ),
    demoMakeRecord("skills-section", "demo-skills", {
      heading: "Skills",
      skills: ["TypeScript", "React", "API integration", "Accessibility"],
    }),
  ];
}
export function demoSeedLayouts(): DemoLayouts {
  return Object.fromEntries(
    demoSchemas.map((schema) => {
      const fieldStyle = (field: string): DemoStyle => ({
        ...demoBaseStyle,
        ...(field === "name"
          ? ({ fontSize: 30, fontFamily: "serif" } as const)
          : field === "heading"
            ? ({ fontSize: 20, fontFamily: "serif" } as const)
            : ["employer", "institution"].includes(field)
              ? ({ weight: "bold", grow: 6 } as const)
              : {}),
        ...(schema.id === "education-entry" ? { fontSize: 15 } : {}),
        ...(["startDate", "endDate"].includes(field) ? { align: "right" as const } : {}),
        ...(["email", "phone", "location", "startDate", "endDate"].includes(field)
          ? { fontSize: 12 }
          : {}),
      });
      const nodes: DemoLayoutNode[] = schema.fields.map((field) => ({
        id: `${schema.id}-${field.id}`,
        kind: field.kind === "records" || field.kind === "record" ? "repeat" : "field",
        field: field.id,
        style: fieldStyle(field.id),
      }));
      const take = (field: string) => {
        const index = nodes.findIndex((node) => "field" in node && node.field === field);
        const node = nodes.splice(index, 1)[0];
        if (!node || index < 0) throw new Error("Unknown demo field.");
        return node;
      };
      const row = (
        id: string,
        children: DemoLayoutNode[],
        style: Partial<DemoStyle> = {},
      ): DemoLayoutNode => ({
        id: `${schema.id}-${id}`,
        kind: "row",
        children,
        style: { ...demoBaseStyle, gap: 12, ...style },
      });
      let content: DemoLayoutNode[];
      if (schema.id === "contact-section")
        content = [
          take("name"),
          row("details-row", [take("location"), take("email"), take("phone")]),
          ...nodes,
        ];
      else if (schema.id === "education-entry" || schema.id === "experience-entry") {
        const name = take(schema.id === "education-entry" ? "institution" : "employer");
        const dates = row("dates-row", [take("startDate"), take("endDate")], {
          align: "right",
          gap: 5,
          grow: 1,
        });
        content = [row("heading-row", [name, dates]), ...nodes];
      } else content = nodes;
      const root: DemoLayoutNode = {
        id: `${schema.id}-root`,
        kind: "column",
        children: content,
        style: {
          ...demoBaseStyle,
          gap: schema.level === "entry" ? 6 : 10,
          padding: schema.id === "education-entry" ? 6 : 0,
        },
      };
      return [schema.id, root];
    }),
  );
}
export function demoInitialState(): DemoState {
  const layouts = demoSeedLayouts();
  return {
    version: 1,
    mode: "template",
    job: "product",
    layouts,
    appliedLayouts: structuredClone(layouts),
    sections: demoSeedSections(),
    previewCount: 2,
    templateSectionOrder: [...demoDefaultSectionOrder],
    appliedSectionOrder: [...demoDefaultSectionOrder],
  };
}
export function demoPreviewSections(count: number, order = demoDefaultSectionOrder): DemoRecord[] {
  return demoSeedSections()
    .sort((a, b) => order.indexOf(a.schema.id) - order.indexOf(b.schema.id))
    .map((section) =>
      !section.children.entries
        ? section
        : {
            ...section,
            children: {
              ...section.children,
              entries: structuredClone(
                demoLibrary
                  .filter(
                    (record) =>
                      record.schema.id ===
                      (section.schema.id === "education-section"
                        ? "education-entry"
                        : "experience-entry"),
                  )
                  .slice(0, count),
              ),
            },
          },
    );
}

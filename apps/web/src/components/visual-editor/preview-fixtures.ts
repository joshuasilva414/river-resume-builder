import type {
  ContentGroup,
  ContentNode,
  FieldValue,
  Resume,
  VisualTemplate,
} from "@river/domain/workspace";

const sampleId = (path: string) => {
  let hash = 14695981039346656037n;
  for (const character of path) {
    hash ^= BigInt(character.charCodeAt(0));
    hash = BigInt.asUintN(64, hash * 1099511628211n);
  }
  return `sample:${hash.toString(16)}`;
};
/** Fictional design samples are projections only and must never be persisted as candidate facts. */
export function templatePreview(template: VisualTemplate, count: number): Resume {
  const value = (
    key: string,
    label: string,
    type: Exclude<FieldValue["kind"], "date"> | "date",
    index: number,
  ): FieldValue => {
    if (type === "date")
      return {
        kind: type,
        value: key.toLowerCase().includes("end")
          ? { precision: "present" }
          : { precision: "year", year: 2022 + index },
      };
    if (type === "number") return { kind: type, value: 3.8 };
    if (type === "boolean") return { kind: type, value: true };
    if (type === "link")
      return {
        kind: type,
        value:
          key === "email"
            ? { label: "maya@example.com", href: "mailto:maya@example.com" }
            : { label: "Portfolio", href: "https://example.com" },
      };
    if (type === "skill") return { kind: type, value: index % 2 ? "Accessibility" : "TypeScript" };
    const samples: Record<string, string> = {
      name: "Maya Chen",
      location: "Austin, TX",
      email: "maya@example.com",
      employer: index ? "Civic Tools" : "Northstar Studio",
      role: "Software Engineer",
      institution: index ? "Central Design Institute" : "Lakeside University",
      degree: "B.S. Computer Science",
      summary: "Software engineer building thoughtful tools for people and teams.",
      highlights: index
        ? "Connected customer workflows to a REST API."
        : "Built accessible onboarding with React and TypeScript.",
    };
    return { kind: type, value: [{ text: samples[key] ?? `Sample ${label.toLowerCase()}` }] };
  };
  const group = (definitionId: string, key: string, path: string, index = 0): ContentGroup => {
    const definition = template.definitions.find((item) => item.id === definitionId);
    if (!definition) throw Error("Missing sample definition");
    const children = definition.fields.flatMap((field): ContentNode[] =>
      Array.from({ length: field.repeat ? count : 1 }, (_, i) => {
        const id = sampleId(`${path}/${field.id}/${i}`);
        return field.type === "group" && field.definitionId
          ? group(field.definitionId, field.key, id, i)
          : {
              kind: "field",
              id,
              key: field.key,
              label: field.label,
              factIds: [],
              value: value(
                field.key,
                field.label,
                field.type === "group" ? "text" : field.type,
                field.repeat ? i : index,
              ),
            };
      }),
    );
    return {
      kind: "group",
      id: sampleId(path),
      key,
      label: definition.label,
      definitionId,
      children,
    };
  };
  return {
    version: 1,
    name: "Fictional design preview",
    template: { id: "preview", revision: 0, document: template },
    job: null,
    unused: [],
    sections: template.sections.map((section) => ({
      ...group(section.definitionId, section.key, section.id),
      label: section.label,
    })),
  };
}

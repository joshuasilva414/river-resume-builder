import {
  applyTemplate,
  type ContentNode,
  type Resume,
  renderingFixture,
  resumeSchema,
  type VisualTemplate,
} from "@river/domain/workspace";
import { z } from "zod";
export const scoreFixtureSchema = z.object({
  id: z.string(),
  name: z.string(),
  resume: resumeSchema,
  mapped: z.boolean(),
});
export const scoreFixtureStorageSchema = z.object({
  version: z.literal(1),
  fixtures: z.array(scoreFixtureSchema).length(3),
});
export type ScoreFixture = z.infer<typeof scoreFixtureSchema>;
const profiles = [
  {
    name: "Maya Chen",
    role: "Product Engineer",
    description:
      "Build accessible products with React, TypeScript, and API integrations. Work with design and support teams to improve onboarding and user experience.",
  },
  {
    name: "Noah Rivera",
    role: "Implementation Engineer",
    description:
      "Configure customer integrations, map data, troubleshoot REST APIs, and write clear technical documentation. Communicate with customers and coordinate implementation milestones.",
  },
  {
    name: "Ava Brooks",
    role: "Frontend Engineer",
    description:
      "Develop accessible web interfaces using React and TypeScript. Collaborate with designers, maintain reusable UI components, and test keyboard navigation and forms.",
  },
];
/** Editable, fictional score fixtures stay separate from every candidate record and save-back action. */
export function initialScoreFixtures(
  template: VisualTemplate,
  id: string,
  revision: number,
): ScoreFixture[] {
  return profiles.map((profile, index) => {
    const original = renderingFixture(index + 1);
    const rename = (node: ContentNode): ContentNode =>
      node.kind === "group"
        ? { ...node, children: node.children.map(rename) }
        : node.key === "name" && node.value.kind === "text"
          ? { ...node, value: { kind: "text", value: [{ text: profile.name }] } }
          : { ...node, factIds: [] };
    const resume: Resume = {
      ...original,
      sections: original.sections.map(rename),
      name: `${profile.name} · fictional fixture`,
      job: {
        id: `fictional-job-${index + 1}`,
        title: profile.role,
        description: profile.description,
      },
    };
    return {
      id: `fixture-${index + 1}`,
      name: profile.name,
      resume: applyTemplate(resume, { id, revision, document: template }),
      mapped: false,
    };
  });
}

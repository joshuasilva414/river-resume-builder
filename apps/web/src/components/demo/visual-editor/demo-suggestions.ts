/** DEMO ONLY: deterministic scripts for the two sample jobs. Replace with reviewed provider requests for production. */

import { demoLibrary } from "./demo-fixtures";
import {
  type DemoRecord,
  type DemoState,
  type DemoTarget,
  demoFindRecord,
  demoReadTarget,
  demoWriteTarget,
} from "./demo-model";

export function demoReplacementSuggestion(
  records: DemoRecord[],
  target: DemoTarget,
  job: DemoState["job"],
) {
  const current = demoFindRecord(records, target.recordId);
  if (target.field || current?.schema.id !== "experience-entry") return null;
  const replacement = demoLibrary.find(
    (record) => record.id === (job === "product" ? "demo-civic" : "demo-wayfinder"),
  );
  if (!replacement || current.values.employer === replacement.values.employer) return null;
  return {
    replacement,
    before: current,
    explanation:
      job === "product"
        ? "This fictional entry highlights keyboard navigation and form validation for an accessible product."
        : "This fictional entry highlights REST integrations, troubleshooting guides, and customer handoffs.",
  };
}

export type DemoSuggestion = {
  id: string;
  title: string;
  explanation: string;
  before: string;
  after: string;
  target: DemoTarget;
  job: DemoState["job"];
};
const demoScripts = [
  {
    job: "product",
    before: "Built an accessible onboarding flow with React and TypeScript.",
    title: "Emphasize accessibility",
    after: "Built an accessible React and TypeScript onboarding flow for new users.",
    explanation: "Leads with the accessible product work requested by this job.",
  },
  {
    job: "product",
    before: "Built an accessible onboarding flow with React and TypeScript.",
    title: "Make it more concise",
    after: "Built accessible onboarding with React and TypeScript.",
    explanation: "Keeps the tools and accomplishment while reducing the length.",
  },
  {
    job: "implementation",
    before: "Connected customer workflows to a REST API.",
    title: "Lead with integration work",
    after: "Integrated a REST API into customer workflows.",
    explanation: "Makes the integration work easier to identify for this implementation role.",
  },
  {
    job: "product",
    before: "Connected customer workflows to a REST API.",
    title: "Emphasize product functionality",
    after: "Connected product workflows to a REST API for customers.",
    explanation: "Connects the technical work to customer-facing product functionality.",
  },
  {
    job: "implementation",
    before: "Built an accessible onboarding flow with React and TypeScript.",
    title: "Keep the technical context",
    after: "Implemented customer onboarding in React and TypeScript with accessibility support.",
    explanation: "Frames onboarding as implementation work without adding new claims.",
  },
  {
    job: "product",
    before:
      "Software engineer building thoughtful tools for people and teams. Experienced in accessible interfaces and API integrations.",
    title: "Tailor the summary",
    after:
      "Software engineer focused on accessible product interfaces, React, TypeScript, and API integrations.",
    explanation: "Brings the sample job’s priorities into the opening sentence.",
  },
  {
    job: "implementation",
    before:
      "Software engineer building thoughtful tools for people and teams. Experienced in accessible interfaces and API integrations.",
    title: "Lead with integrations",
    after:
      "Software engineer with experience connecting customer workflows to APIs and building accessible interfaces.",
    explanation: "Makes the integration experience prominent for the sample role.",
  },
] as const;
export function demoSuggestions(
  records: DemoRecord[],
  target: DemoTarget,
  job: DemoState["job"],
): DemoSuggestion[] {
  const before = demoReadTarget(records, target);
  return demoScripts
    .filter((script) => script.job === job && script.before === before)
    .map((script, index) => ({
      ...script,
      id: `${job}-${target.recordId}-${target.field}-${index}`,
      target,
    }));
}
export function demoApplySuggestion(state: DemoState, suggestion: DemoSuggestion): DemoState {
  if (
    state.job !== suggestion.job ||
    demoReadTarget(state.sections, suggestion.target) !== suggestion.before
  )
    throw new Error("This block or job changed. Open its suggestions again before applying.");
  return {
    ...state,
    sections: demoWriteTarget(state.sections, suggestion.target, suggestion.after),
  };
}

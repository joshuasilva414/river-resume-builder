import { account } from "./pages/account";
import { ai } from "./pages/ai";
import { aiConnections } from "./pages/ai-connections";
import { contentTypes } from "./pages/content-types";
import { editing } from "./pages/editing";
import { evidence } from "./pages/evidence";
import { evidenceModel } from "./pages/evidence-model";
import { exportGuide } from "./pages/export";
import { fileFormats } from "./pages/file-formats";
import { history } from "./pages/history";
import { jobs } from "./pages/jobs";
import { library } from "./pages/library";
import { quickStart } from "./pages/quick-start";
import { reviewStates } from "./pages/review-states";
import { savedVersions } from "./pages/saved-versions";
import { scoring } from "./pages/scoring";
import { sourceRefinement } from "./pages/source-refinement";
import { sources } from "./pages/sources";
import { templates } from "./pages/templates";
import { troubleshooting } from "./pages/troubleshooting";
import { workspaceReference } from "./pages/workspace-reference";

// Each page has one writing mode. Keep this order aligned with the navigation groups.
export const guides = [
  quickStart,
  account,
  sources,
  evidence,
  jobs,
  library,
  editing,
  aiConnections,
  ai,
  templates,
  exportGuide,
  history,
  scoring,
  sourceRefinement,
  troubleshooting,
  fileFormats,
  contentTypes,
  reviewStates,
  workspaceReference,
  evidenceModel,
  savedVersions,
] as const;

export type GuideSlug = (typeof guides)[number]["slug"];

import { type Guide, GuideLink } from "../shared";

export const workspaceReference = {
  slug: "workspace-reference",
  title: "Workspace access and limits",
  description:
    "Account isolation, collection behavior, processing limits, and administrator controls.",
  group: "Reference",
  sections: [
    {
      id: "access",
      title: "Account access",
      body: (
        <>
          <p>
            River is a private application. An administrator must enable your email address before
            you can create an account. Each account has its own sources, evidence, jobs, content,
            templates, résumés, and files.
          </p>
          <p>
            There are no shared workspaces or collaboration controls. Administrator status does not
            provide access to another account’s private content. Public documentation does not
            expose workspace records or downloads.
          </p>
        </>
      ),
    },
    {
      id: "collections",
      title: "Workspace collections",
      body: (
        <>
          <dl>
            <dt>Sources</dt>
            <dd>Original documents or text and their extraction results.</dd>
            <dt>Evidence</dt>
            <dd>Typed facts and skills with keywords and optional sources.</dd>
            <dt>Jobs</dt>
            <dd>Posting captures, qualifications, eligibility items, and selected evidence.</dd>
            <dt>Library</dt>
            <dd>Reusable sections and entries with directly editable fields.</dd>
            <dt>Templates</dt>
            <dd>Content schemas and compatible layouts for rendering them.</dd>
            <dt>Résumés and history</dt>
            <dd>Working compositions, saved versions, and retained exports.</dd>
          </dl>
          <p>
            Sources, evidence, templates, reusable content, sections, and jobs support Delete and
            Restore through Trash. Use Undo in the notification to reverse the action. Existing
            saved references remain readable.
          </p>
        </>
      ),
    },
    {
      id: "contexts",
      title: "Earlier evidence context records",
      body: (
        <>
          <p>
            Older evidence can include employment, project, education, certification, or other
            context records. Those records remain readable alongside their saved references.
          </p>
          <p>
            New evidence does not require a context record, source, or verification decision. Use
            its text, type, keywords, and optional sources.
          </p>
        </>
      ),
    },
    {
      id: "usage",
      title: "AI, processing, and scoring limits",
      body: (
        <>
          <p>
            Personal AI connections have no daily River quota. Provider billing and provider rate
            limits still apply. River bounds simultaneous work; if capacity is busy, wait for a task
            to finish or cancel work you no longer need.
          </p>
          <p>
            Scoring has a separate default allowance of 25 successful results per UTC day for normal
            accounts. Each successful template sample counts. Failed or cancelled work releases its
            reserved capacity, and reusing a saved result does not charge again. Administrators are
            exempt from the daily cap.
          </p>
          <p>
            Input, file, time, and retry limits still apply. See{" "}
            <GuideLink slug="file-formats">File formats and limits</GuideLink>,{" "}
            <GuideLink slug="ai-connections">Connect your AI provider</GuideLink>, and{" "}
            <GuideLink slug="scoring">Score a résumé</GuideLink>.
          </p>
        </>
      ),
    },
    {
      id: "admin",
      title: "Administrator dashboard and backups",
      body: (
        <>
          <p>
            Administrators use the admin area to inspect aggregate usage and per-account identities
            and counts. The dashboard covers users, active users, jobs and imports, evidence,
            templates, exports, processing, and scoring.
          </p>
          <p>
            These views provide counts and account identifiers, not private source text, evidence,
            job descriptions, résumé wording, or document downloads.
          </p>
          <p>
            Backup controls and scoring allowance configuration or reset are available in the admin
            area. Normal accounts do not receive backup or administrator controls.
          </p>
        </>
      ),
    },
    {
      id: "agents",
      title: "Agent access",
      body: (
        <>
          <p>
            Agent credentials provide only their assigned scopes within the owning account. They do
            not grant access to other accounts or administrator privileges.
          </p>
          <p>
            The public API supports the permitted source, evidence, context, and job actions. An
            agent’s access depends on its credential scopes. Retired evidence-verification commands
            return a migration error; saved historical decisions remain readable.
          </p>
        </>
      ),
    },
    {
      id: "devices",
      title: "Devices and preferences",
      body: (
        <>
          <p>
            River is designed primarily for desktop use. Use the shared theme control to change
            light or dark appearance. The old Appearance settings tab is no longer needed.
          </p>
          <p>
            AI assistance and scoring are optional services. Manual writing, document review, and
            export remain available when those services are unavailable.
          </p>
        </>
      ),
    },
  ],
} as const satisfies Guide;

import type { Guide } from "../shared";

export const workspaceReference = {
  slug: "workspace-reference",
  title: "Workspace access and limits",
  description:
    "Account access, workspace collections, agent permissions, and processing allowances.",
  group: "Reference",
  sections: [
    {
      id: "access",
      title: "Account access",
      body: (
        <>
          <p>
            River admits accounts by email address. The service administrator enables each address.
            GitHub authentication follows the same admission policy.
          </p>
          <p>
            Each account owns a private workspace. River does not provide teams, shared documents,
            or collaborative editing. A document link does not grant another account access.
          </p>
          <p>
            The public documentation requires no account. Sources, evidence, drafts, checkpoints,
            and private downloads require authorized access.
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
            <dt>Job targets</dt>
            <dd>
              Job details, saved posting snapshots, requirements, selected evidence, and résumé
              drafts.
            </dd>
            <dt>Evidence bank</dt>
            <dd>
              Claims, citations, context records, review decisions, and duplicate comparisons.
            </dd>
            <dt>Content library</dt>
            <dd>Reusable Content items, Blocks, and Sections.</dd>
            <dt>Templates</dt>
            <dd>Built-in layouts, saved template revisions, validation, and approval.</dd>
            <dt>Sources</dt>
            <dd>Original material, its provenance, and extracted text.</dd>
            <dt>Settings</dt>
            <dd>
              Account information, sessions, task usage, and Agent Credentials. Backup controls are
              restricted to the administrator.
            </dd>
          </dl>
        </>
      ),
    },
    {
      id: "contexts",
      title: "Evidence context records",
      body: (
        <>
          <p>
            A context record describes the background for related claims. Claims reference an exact
            saved context revision.
          </p>
          <dl>
            <dt>Owner profile</dt>
            <dd>The account owner's identity and contact information.</dd>
            <dt>Employment</dt>
            <dd>A period of work for an employer or organization.</dd>
            <dt>Project</dt>
            <dd>A body of work the account owner created or contributed to.</dd>
            <dt>Education</dt>
            <dd>A program of study, including its institution, qualification, and dates.</dd>
            <dt>Credential</dt>
            <dd>A qualification, certification, award, or license from an issuing organization.</dd>
          </dl>
        </>
      ),
    },
    {
      id: "usage",
      title: "Processing allowances",
      body: (
        <>
          <p>The account usage display reports active tasks, daily usage, and the next reset.</p>
          <dl>
            <dt>Active tasks</dt>
            <dd>Up to four pending or running tasks per account.</dd>
            <dt>Daily tasks</dt>
            <dd>Up to 100 new tasks per account. The daily allowance resets at midnight UTC.</dd>
            <dt>Shared allowance</dt>
            <dd>
              Service-wide limits also apply. A request can reach a shared limit before its account
              allowance is exhausted.
            </dd>
          </dl>
          <p>
            AI requests, document extraction, rendering, validation, and scoring share these
            allowances. Failed and cancelled tasks still count toward daily usage.
          </p>
          <p>
            An ended task releases its active slot. Replaying the same accepted request does not
            consume another task. A newly requested attempt counts again.
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
            An Agent Credential is a named credential with selected permissions. Credentials can
            expire or be revoked.
          </p>
          <p>
            Authorized agents can access permitted source, evidence, context, and job operations.
            External agents cannot create Owner attestations or mutate résumés and templates.
          </p>
          <p>Credential permissions do not bypass account ownership or admission checks.</p>
        </>
      ),
    },
    {
      id: "devices",
      title: "Devices and optional services",
      body: (
        <>
          <p>
            Résumé composition is designed for desktop browsers. Smaller screens support review and
            history.
          </p>
          <p>
            AI assistance and ATS scoring depend on configured external services. Those tasks can
            transmit their selected inputs to the configured service.
          </p>
          <p>
            Manual evidence work, résumé assembly, approved template use, PDF preview, and export
            remain available without AI assistance.
          </p>
        </>
      ),
    },
  ],
} as const satisfies Guide;

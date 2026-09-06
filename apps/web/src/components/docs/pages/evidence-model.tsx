import { type Guide, GuideLink } from "../shared";

export const evidenceModel = {
  slug: "evidence-model",
  title: "Sources, claims, and résumé wording",
  description:
    "Why River separates original material, reviewed facts, and the text you put on a résumé.",
  group: "Explanation",
  sections: [
    {
      id: "separation",
      title: "Different records answer different questions",
      body: (
        <>
          <p>
            A résumé compresses your experience for a specific reader. That compression can hide
            where a statement came from or how much its source supports.
          </p>
          <p>
            River keeps the original material in a Source Artifact. A claim states a fact about your
            work. A Content item expresses that fact as résumé wording.
          </p>
          <p>
            These separate records let you change the presentation while retaining the basis for the
            statement. They also make unsupported wording visible before export.
          </p>
        </>
      ),
    },
    {
      id: "example",
      title: "A project statement and its support",
      body: (
        <>
          <p>
            Consider a fictional project note that says, "Built a booking form with React." The note
            becomes a source, and a citation identifies that exact passage.
          </p>
          <p>
            A claim can repeat the supported fact. A Content item can use the fact as an
            accomplishment under a project entry.
          </p>
          <p>
            The note does not establish the number of users or a reduction in booking time. Adding
            either result would require additional support.
          </p>
          <p>
            River's separation makes that gap inspectable. The presence of a citation alone cannot
            establish that every part of a sentence is supported.
          </p>
        </>
      ),
    },
    {
      id: "verification",
      title: "Verification is an explicit decision",
      body: (
        <>
          <p>
            Source text can contain errors, outdated information, or an account that needs
            clarification. Importing the text preserves its origin without deciding whether the
            claim is accurate.
          </p>
          <p>
            Verification records a reviewer's decision about a particular Evidence Revision and its
            citations. The rationale explains the basis for that decision.
          </p>
          <p>
            An Owner attestation records your firsthand account. The attestation label remains
            visible because a personal account and an independent record have different origins.
          </p>
          <p>
            AI-generated claims follow the same distinction. Accepting a candidate creates a Draft
            claim, which still needs review.
          </p>
        </>
      ),
    },
    {
      id: "job-selection",
      title: "Job selection is separate from composition",
      body: (
        <>
          <p>
            A job target records the requirements in a posting. Evidence associations show which
            claims support those requirements.
          </p>
          <p>
            A general job selection provides context without resolving a particular requirement. A
            requirement association connects a claim to a specific need.
          </p>
          <p>
            A résumé draft uses selected Content items in its composition. Selecting a claim for a
            job does not automatically create that wording or place it in the draft.
          </p>
          <p>
            Keeping selection separate gives you control over what the résumé emphasizes and what it
            leaves out.
          </p>
        </>
      ),
    },
    {
      id: "further-reading",
      title: "Related guides",
      body: (
        <>
          <p>
            <GuideLink slug="evidence">Create and review claims</GuideLink> covers citations and
            review decisions.
          </p>
          <p>
            <GuideLink slug="library">Build reusable sections</GuideLink> covers the wording that
            appears on a résumé.
          </p>
          <p>
            <GuideLink slug="review-states">Review states and export checks</GuideLink> defines the
            states and warnings.
          </p>
        </>
      ),
    },
  ],
} as const satisfies Guide;

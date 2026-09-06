import { type Guide, GuideLink } from "../shared";

export const sources = {
  slug: "sources",
  title: "Add source material",
  description: "Import a document, paste source text, or record a firsthand account of your work.",
  group: "How-to guides",
  sections: [
    {
      id: "add-source",
      title: "Save a document or pasted text",
      body: (
        <>
          <p>
            Before an upload, check the{" "}
            <GuideLink slug="file-formats">File formats and limits</GuideLink>.
          </p>
          <p>To add the source, follow these steps.</p>
          <ol>
            <li>
              Open <strong>Sources</strong>.
            </li>
            <li>
              Select <strong>Add source</strong>.
            </li>
            <li>
              Enter a recognizable <strong>Title</strong>.
            </li>
            <li>
              For a file, set <strong>Source type</strong> to <strong>Document file</strong>. For
              text, select <strong>Pasted text</strong>.
            </li>
            <li>
              Choose the file or paste the original wording into <strong>Source text</strong>.
            </li>
            <li>
              If you have an origin URL, enter the URL in <strong>Source URL</strong>.
            </li>
            <li>
              If the origin needs explanation, add a <strong>Provenance note</strong>.
            </li>
            <li>
              Select <strong>Save source</strong>.
            </li>
          </ol>
        </>
      ),
    },
    {
      id: "attestations",
      title: "Record your own account",
      body: (
        <>
          <p>
            To record firsthand information that is absent from your documents, use an Owner
            attestation.
          </p>
          <ol>
            <li>
              Open <strong>Sources → Add source</strong>.
            </li>
            <li>Enter a title.</li>
            <li>
              Set <strong>Source type</strong> to <strong>Owner attestation</strong>.
            </li>
            <li>
              Describe your contribution in <strong>Your attestation</strong>.
            </li>
            <li>Add a note about when the work happened and what supports your account.</li>
            <li>
              Select <strong>Save source</strong>.
            </li>
          </ol>
          <p>
            For the distinction between an attestation and verification, see{" "}
            <GuideLink slug="evidence-model">Sources, claims, and résumé wording</GuideLink>.
          </p>
        </>
      ),
    },
    {
      id: "inspect",
      title: "Inspect the extraction",
      body: (
        <>
          <p>Before you cite the source, inspect the extracted text.</p>
          <ol>
            <li>Select the source after processing finishes.</li>
            <li>Check names, dates, numbers, and reading order in the extracted text.</li>
            <li>
              If you need the original for comparison, select <strong>Download original</strong>.
            </li>
            <li>
              If the extraction is incomplete, follow{" "}
              <GuideLink slug="troubleshooting">Resolve common problems</GuideLink>.
            </li>
          </ol>
          <p>
            To use a passage in your evidence bank, follow{" "}
            <GuideLink slug="evidence">Create and review claims</GuideLink>.
          </p>
        </>
      ),
    },
  ],
} as const satisfies Guide;

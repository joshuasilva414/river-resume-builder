import { type Guide, GuideLink } from "../shared";

export const sources = {
  slug: "sources",
  title: "Add source material",
  description: "Import a document or pasted text, then review editable evidence from it.",
  group: "How-to guides",
  sections: [
    {
      id: "add-source",
      title: "Save a document or pasted text",
      body: (
        <>
          <ol>
            <li>
              Open <strong>Sources</strong> and select <strong>Add source</strong>.
            </li>
            <li>
              Enter a title and choose <strong>Document file</strong> or{" "}
              <strong>Pasted text</strong>.
            </li>
            <li>
              Select the document or paste its original text. Add an optional source URL or note.
            </li>
            <li>
              Check <strong>AI for this action</strong> and choose the connected model you want for
              evidence extraction.
            </li>
            <li>
              Select <strong>Save source</strong>. River processes the source and then extracts
              evidence using that model.
            </li>
          </ol>
          <p>
            You can leave the page while processing continues. Without an available AI connection,
            keep the source and add evidence manually or start extraction after connecting a model.
            See <GuideLink slug="ai-connections">Connect your AI provider</GuideLink>.
          </p>
          <p>
            A Source URL records where material came from. To retrieve a job posting from its URL,
            use <GuideLink slug="jobs">Import job</GuideLink>. For accepted files and size limits,
            see <GuideLink slug="file-formats">File formats and limits</GuideLink>.
          </p>
        </>
      ),
    },
    {
      id: "attestations",
      title: "Add firsthand information",
      body: (
        <>
          <p>
            For a fact you already know, open Evidence and add it directly. A source document or
            attestation is optional.
          </p>
          <p>
            If you want to keep longer notes, save them as pasted text. Existing sources labeled
            Owner attestation remain available with their original wording.
          </p>
        </>
      ),
    },
    {
      id: "inspect",
      title: "Review the extracted evidence",
      body: (
        <>
          <ol>
            <li>
              Open the source and inspect <strong>Extracted text</strong> if you need to check the
              document conversion.
            </li>
            <li>When evidence extraction finishes, open its review.</li>
            <li>
              Edit item text, types, and keywords. Remove unsupported details and select the items
              you want.
            </li>
            <li>
              Select <strong>Add selected</strong> or <strong>Add all</strong>. The count includes
              results across every page.
            </li>
          </ol>
          <p>
            This is the import review. Added items are saved and usable immediately. Skills can come
            from any part of the source. They contain skill names; other items use résumé wording
            with an implied first-person subject.
          </p>
          <p>
            If processing or extraction fails, the source remains available. Follow the displayed
            retry action, choose another model for a new extraction, or add evidence manually.{" "}
            <strong>Cancel</strong> stops pending work from publishing late results.
          </p>
        </>
      ),
    },
    {
      id: "trash",
      title: "Delete or restore a source",
      body: (
        <>
          <p>
            Select <strong>Delete source</strong> to move a source to Trash. No reason is required.
            To recover it, open Trash and select <strong>Restore source</strong>.
          </p>
          <p>
            Existing evidence links and saved résumés retain their saved information. Deleting a
            source invalidates pending extraction results. After restoring it, extract again before
            adding results.
          </p>
        </>
      ),
    },
  ],
} as const satisfies Guide;

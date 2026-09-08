import { type Guide, GuideLink } from "../shared";

export const troubleshooting = {
  slug: "troubleshooting",
  title: "Resolve common problems",
  description:
    "Recover imports, review changed inputs, fix document errors, and restore deleted items.",
  group: "How-to guides",
  sections: [
    {
      id: "sign-in",
      title: "Recover account access",
      body: (
        <>
          <p>
            Use the email address enabled for your account. If account creation is unavailable,
            confirm the address with the person who gave you access.
          </p>
          <p>
            For a forgotten password, use <strong>Forgot password?</strong> and follow the reset
            email. Check spam if it does not arrive. See{" "}
            <GuideLink slug="account">Access your workspace</GuideLink>.
          </p>
        </>
      ),
    },
    {
      id: "source",
      title: "Recover a failed source import",
      body: (
        <>
          <p>
            Check the file type, size, and PDF page limit in{" "}
            <GuideLink slug="file-formats">File formats and limits</GuideLink>. An image-only scan
            needs selectable text from another source; River does not perform OCR.
          </p>
          <p>
            If upload is incomplete, use the resume action with the exact original file or text. For
            a processing failure, use the displayed retry action.
          </p>
          <p>
            If evidence extraction fails, the source remains saved. Choose a working model and
            extract again, or add evidence manually. Cancelled extraction cannot add late results.
          </p>
        </>
      ),
    },
    {
      id: "job-import",
      title: "Continue a blocked job import",
      body: (
        <>
          <p>
            If the public page cannot be retrieved, copy the full description and choose{" "}
            <strong>Paste text</strong> in <strong>Import job</strong>. A page that requires sign-in
            or blocks retrieval needs this fallback.
          </p>
          <p>
            If text was retrieved but analysis failed, review the retained text. Retry or enter job
            details manually and save. If you edit the description after analysis, reanalyze it or
            explicitly confirm the requirements before saving.
          </p>
          <p>
            A cancelled or superseded import cannot save a late result. See{" "}
            <GuideLink slug="jobs">Tailor to a job posting</GuideLink>.
          </p>
        </>
      ),
    },
    {
      id: "conflict",
      title: "Preserve edits after a conflict",
      body: (
        <>
          <p>
            If River reports that another save changed the record, keep a copy of your unsaved text.
            Reload the current version and compare it before applying your changes again.
          </p>
          <p>
            For a selected/all action, a stale target prevents the entire batch from applying.
            Refresh the result set, inspect your selection, and try again. Retrying the same
            successful command does not duplicate it.
          </p>
        </>
      ),
    },
    {
      id: "preview",
      title: "Refresh an old preview",
      body: (
        <>
          <p>
            Check whether saving or rendering is still in progress. The previous successful PDF
            remains visible while a newer preview is pending or failed.
          </p>
          <p>
            Correct any reported content or template error. Wait for the preview for the latest edit
            before confirming insertion or exporting. An old rendering response cannot replace a
            newer result.
          </p>
        </>
      ),
    },
    {
      id: "export",
      title: "Complete a blocked export",
      body: (
        <>
          <p>
            Open the document checks. Correct compilation failures, unsafe template source, missing
            required content, or unexpected missing or duplicated text. Capture a corrected version
            and inspect its PDF and extracted text.
          </p>
          <p>
            Reading-order findings are diagnostic. Review them when arranging columns or changing a
            layout. Source links and historical evidence verification states do not block a new
            export, and changed or trashed references require no acknowledgment.
          </p>
          <p>
            If a required layout or schema reference is missing, incompatible, private, or circular,
            correct that reference in the template before saving.
          </p>
        </>
      ),
    },
    {
      id: "assistance",
      title: "Resume AI or scoring work",
      body: (
        <>
          <p>
            Check that the selected AI connection is active, its key works, and the model supports
            the task. Retry within the displayed limit or start a new task with another model. River
            does not silently switch providers.
          </p>
          <p>
            If <strong>Inputs changed</strong> appears, review fresh results based on the current
            material. It applies to relevant changes made after analysis, not an unchanged initial
            paste or a result’s own successful save.
          </p>
          <p>
            If capacity is busy, wait for active work to finish. Personal AI has no daily River
            quota. A scoring allowance message instead refers to successful scoring results: the
            normal default is 25 per UTC day. Failed work and reused saved results do not consume
            it.
          </p>
          <p>
            Saved results remain readable when a service is unavailable. See{" "}
            <GuideLink slug="ai-connections">AI connections</GuideLink> and{" "}
            <GuideLink slug="scoring">Scoring</GuideLink>.
          </p>
        </>
      ),
    },
    {
      id: "missing",
      title: "Find a missing item or update",
      body: (
        <>
          <p>
            Check your search and filters, then look in <strong>Trash</strong>. Use{" "}
            <strong>Restore</strong> to make a deleted item available in active lists again.
          </p>
          <p>
            A saved résumé retains the content it originally used. If you expected a library change
            to appear, inspect and apply the available update explicitly.
          </p>
          <p>
            If a layout switch hides a field, its value remains saved. Choose a compatible layout
            that displays it. For a missing skill option, confirm that the evidence is active and
            has type <strong>Skill</strong>.
          </p>
        </>
      ),
    },
  ],
} as const satisfies Guide;

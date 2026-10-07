import { account } from "./pages/account";
import type { Guide } from "./shared";

export const guides = [
  {
    slug: "quick-start",
    title: "Build your first résumé",
    description: "Move from candidate facts to a tailored résumé and a retained PDF.",
    group: "Tutorials",
    sections: [
      {
        id: "facts",
        title: "Start with facts or write directly",
        body: (
          <p>
            Add information in Fact Bank, or import a document and edit the proposed facts before
            saving. Facts can belong to an employer, project, education, profile, or custom context.
            You can also start writing directly in a résumé.
          </p>
        ),
      },
      {
        id: "template",
        title: "Choose a visual template",
        body: (
          <p>
            Open Templates and choose the editorial starter or a blank structure. Select Use
            template to capture its current layout in a new résumé. Choose a job target to retain
            the description used for suggestions and scoring.
          </p>
        ),
      },
      {
        id: "edit",
        title: "Fill the document",
        body: (
          <p>
            Click a block to select it. Double-click, Enter, or F2 starts editing. Escape finishes
            editing. Plus buttons create blank entries. Use the side panel to insert facts or
            reusable content. Mapping preserves values that do not fit the selected template.
          </p>
        ),
      },
      {
        id: "export",
        title: "Save and export",
        body: (
          <p>
            Wait for Saved. Open PDF preview to inspect actual pagination. Save a named version or
            export from Versions &amp; exports. A download becomes available after the exact PDF is
            retained privately.
          </p>
        ),
      },
    ],
  },
  account,
  {
    slug: "facts",
    title: "Manage facts and reusable content",
    description:
      "Facts describe the candidate. Content stores independent wording and collections.",
    group: "How-to guides",
    sections: [
      {
        id: "model",
        title: "Facts, content, and copies",
        body: (
          <>
            <p>
              Supported values are prose, bullets, skills, dates, numbers, links, and booleans.
              Prose and bullets support bold, italic, and links. Dates can specify a year, month,
              full date, or Present.
            </p>
            <p>
              Saved facts are treated as factual. Optional source links record provenance. Creating
              content from facts or inserting content into a résumé copies the values. Later edits
              never silently update those copies.
            </p>
          </>
        ),
      },
      {
        id: "reuse",
        title: "Save any useful block",
        body: (
          <p>
            Save a bullet, skill, entry, or complete section to Content library. The editor also has
            explicit actions to save information back to Fact Bank. Neither action changes the
            original document.
          </p>
        ),
      },
      {
        id: "delete",
        title: "Delete and restore",
        body: (
          <p>
            Deleted facts, contexts, content, templates, and résumés appear in Trash. Move or delete
            a context's facts before deleting the context. Restore required contexts and sources
            before restoring facts that reference them.
          </p>
        ),
      },
    ],
  },
  {
    slug: "sources",
    title: "Import documents",
    description: "Extract text in the active browser and choose what to keep.",
    group: "How-to guides",
    sections: [
      {
        id: "formats",
        title: "Supported files",
        body: (
          <p>
            Import text-based PDF, DOCX, TXT, Markdown, or pasted text. Files can be up to 10 MiB
            and extracted source text up to 500,000 characters. Fact AI accepts up to 150,000
            characters. Split larger documents before requesting suggestions.
          </p>
        ),
      },
      {
        id: "preview",
        title: "Correct the import preview",
        body: (
          <p>
            Choose Suggest facts to request AI extraction, or add facts manually. Edit types,
            values, labels and contexts. Exclude unwanted facts, then add the included facts
            together. Saving originals and extracted text in Sources is optional.
          </p>
        ),
      },
      {
        id: "empty",
        title: "Empty and scanned documents",
        body: (
          <p>
            If a PDF has no extractable text, paste the text to continue. River does not perform
            OCR. Agents must submit extracted text and may include original bytes; file-only
            headless extraction is unavailable.
          </p>
        ),
      },
    ],
  },
  {
    slug: "templates",
    title: "Design visual templates",
    description: "Define reusable structure and presentation separately from résumé values.",
    group: "How-to guides",
    sections: [
      {
        id: "structure",
        title: "Fields and repeating entries",
        body: (
          <p>
            Add custom sections such as Publications or Workshops. Give fields stable semantic keys
            and simple types. Groups can repeat. Define each entry layout once; the résumé decides
            how many entries to include.
          </p>
        ),
      },
      {
        id: "layout",
        title: "Layout and fixed text",
        body: (
          <p>
            Use rows, columns, widths, alignment, spacing, typography, and literal text. Prefixes
            and suffixes belong to the template. Separators appear only between populated values.
            Zero and false are real values. Removing a container unwraps its fields.
          </p>
        ),
      },
      {
        id: "changes",
        title: "Apply changes explicitly",
        body: (
          <p>
            A résumé keeps the template version captured when it was created. Use Apply latest
            layout to adopt changes. Compatible fields map by semantic key and type; map unmatched
            fields explicitly. Unused values remain available. Applying a layout preserves entry
            counts and field values.
          </p>
        ),
      },
    ],
  },
  {
    slug: "editing",
    title: "Edit and arrange blocks",
    description: "Desktop controls for template and résumé editing.",
    group: "Reference",
    sections: [
      {
        id: "keyboard",
        title: "Selection and editing",
        body: (
          <p>
            Single-click selects. Double-click, Enter, or F2 edits. Escape ends editing or cancels
            dragging. Delete and Backspace remove the selection when you are not typing.
            Command/Control Z undoes; Command/Control Shift Z redoes. Text editing keeps native
            cursor behavior.
          </p>
        ),
      },
      {
        id: "move",
        title: "Move within boundaries",
        body: (
          <p>
            Drag the block handle. A moving preview and blue insertion line show the target.
            Sections, entries, and bullet lists reorder among their siblings. Use move controls for
            keyboard access. Reparenting is an explicit template action. Drag an area across the
            template canvas to select multiple fields.
          </p>
        ),
      },
      {
        id: "save",
        title: "Autosave and conflicts",
        body: (
          <p>
            Incomplete drafts autosave. The header shows pending, saved, storage, and conflict
            states. A browser recovery copy protects interrupted work. If another session changed
            the draft, reload the saved version or save your local work as a separate copy. Undo
            history is limited to the current editing session.
          </p>
        ),
      },
    ],
  },
  {
    slug: "export",
    title: "PDFs and saved versions",
    description: "Inspect actual pagination and retain exact generated files.",
    group: "How-to guides",
    sections: [
      {
        id: "preview",
        title: "Canvas and PDF preview",
        body: (
          <p>
            The editable canvas approximates the document. PDF preview shows the actual
            browser-generated pages. Preview refresh is debounced; the last successful preview
            remains visible while a newer version renders. Check its freshness before exporting.
          </p>
        ),
      },
      {
        id: "history",
        title: "Immutable versions and exports",
        body: (
          <p>
            Name a saved version to capture a draft revision. Restoring it creates a new draft
            revision. Export freezes the saved inputs, generates a PDF in a browser worker, checks
            text completeness and reading order, then uploads those exact bytes. Failed uploads
            retain the generated file for retry while the panel remains open.
          </p>
        ),
      },
      {
        id: "limits",
        title: "Warnings and failures",
        body: (
          <p>
            Missing values and layout warnings do not block export. Rendering failures or detected
            text loss prevent successful export. Optional scoring failures never block export.
            Retained PDFs can be downloaded on smaller screens; editing requires a desktop-sized
            workspace.
          </p>
        ),
      },
    ],
  },
  {
    slug: "scoring",
    title: "Suggestions and scorecards",
    description: "Optional feedback on wording and submitted text.",
    group: "How-to guides",
    sections: [
      {
        id: "suggestions",
        title: "Request a suggestion",
        body: (
          <p>
            Hover reveals controls. Click the suggestion control, then explicitly request wording or
            library alternatives. Choose facts to use as context. Review before and after. Applying
            changes one target and creates one undo step. A changed target or selected job
            invalidates the preview.
          </p>
        ),
      },
      {
        id: "score",
        title: "Résumé and template scores",
        body: (
          <p>
            Résumé scoring uses checked PDF text and the captured job description. Template scoring
            uses three editable fictional résumé/job pairs. Fill or map custom fields and review
            each sample first. Fictional samples never enter Fact Bank.
          </p>
        ),
      },
      {
        id: "meaning",
        title: "What the scores cover",
        body: (
          <p>
            Scorecards assess submitted text, not PDF appearance or factual verification. River
            retains inputs, provider metadata and results. Failed requests leave saving and export
            available. Quotas and input limits are shown before submission.
          </p>
        ),
      },
    ],
  },
  {
    slug: "workspace-reference",
    title: "Workspace access and limits",
    description: "Accounts, settings, jobs and previous material.",
    group: "Reference",
    sections: [
      {
        id: "access",
        title: "Private workspace",
        body: (
          <p>
            Your records, versions, originals, and PDFs are scoped to your account. Agent
            credentials grant only their listed permissions. AI connections and selected defaults
            are managed in Settings. Content AI uses your connection; scorecards use River's
            separate scoring provider.
          </p>
        ),
      },
      {
        id: "jobs",
        title: "Job targets",
        body: (
          <p>
            Save the posting text and select candidate facts. Shared keyword terms help locate
            relevant facts without assessing qualifications. Earlier posting descriptions remain
            readable. Existing résumés keep their captured description when a job target changes.
          </p>
        ),
      },
      {
        id: "archive",
        title: "Previous workspace",
        body: (
          <p>
            The clean cutover preserves old evidence, content, templates, résumés, versions, and
            retained file manifests in a read-only archive. Existing accounts, settings, sources and
            job targets remain. Old templates are not converted or re-rendered. Expired temporary
            previews remain unavailable.
          </p>
        ),
      },
    ],
  },
  {
    slug: "troubleshooting",
    title: "Recover interrupted work",
    description: "Resolve import, save, rendering and provider failures.",
    group: "Reference",
    sections: [
      {
        id: "save",
        title: "Draft did not save",
        body: (
          <p>
            Keep the tab open and read the save state. Retry when the connection returns. For
            conflicts, compare the current saved revision or save a separate copy. Browser storage
            is a recovery aid; a visible storage warning means that fallback is unavailable.
          </p>
        ),
      },
      {
        id: "pdf",
        title: "PDF could not be exported",
        body: (
          <p>
            Check the rendering or text-loss message and correct the affected fields. Inspect the
            actual PDF preview. If upload failed after generation, retry the retained export input.
            Do not close the panel until upload completes.
          </p>
        ),
      },
      {
        id: "ai",
        title: "AI or scoring failed",
        body: (
          <p>
            Check the saved AI connection and selected model in Settings. Provider failures and
            quota limits do not prevent manual editing, saving, or PDF export. Request a new
            suggestion if the target or job changed.
          </p>
        ),
      },
    ],
  },
] as const satisfies readonly Guide[];
export type GuideSlug = (typeof guides)[number]["slug"];

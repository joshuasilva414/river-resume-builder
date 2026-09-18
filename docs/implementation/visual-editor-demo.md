# River visual editor demo

This is an isolated, mid-fidelity interaction demonstration. All résumé content, jobs, library entries, and suggestions are fictional. It does not call AI providers, write production résumés or templates, publish layouts, compile documents, or export PDFs.

Branch: `feature/river-visual-editor-demo`, based on `dev` at `903ed5e2517de6391dbb48a394f45677cd3c2219`. Local `dev` was fast-forwarded by 35 commits. The pre-existing edits in `ai-failure-diagnostics.md` and `security-review-2026-09-07.md` are unrelated and preserved.

## Run locally

Use the existing River development configuration and local account. This feature adds no database migrations or environment variables.

1. Run `pnpm install` from the repository root.
2. Run `pnpm --filter @river/web dev`.
3. Sign in at `http://127.0.0.1:3000`, then open **Visual editor demo** or `/demo/visual-editor`.

The route checks the server-reported environment and session before rendering. Anonymous development requests redirect to sign-in. Other environments receive a not-found result. The navigation link is development-only. The editor is lazy-loaded; its static demo assets can still exist in a production build, but the route remains unavailable.

## Try the workflows

In **Design template**, choose a section or entry layout. Select a field in the document or Structure tree. Drag its handle to reorder within its current container, or use **Up** and **Down**. Use **Move into** for deliberate nesting changes. A lifted block follows the pointer and a blue insertion line marks its destination. Escape cancels a drag. Section handles move whole sections; entry handles in résumé mode reorder entries only within their collection.

Insert rows and columns from the right-hand Structure inspector. **Delete container**, Backspace, and Delete unwrap the selected container and retain all its fields. Root containers and schema fields cannot be deleted. A single selected block has a blue outline; repeated samples do not all acquire selection borders. Change width weights, alignment, font, and spacing. The breadcrumbs let you select enclosing containers. Font and alignment changes on a container apply to its descendants.

**Preview entries** renders zero to three examples for both Experience and Education. These are sample counts, independent of the résumé's actual counts. Each schema has one layout definition; all instances use that definition. Blank schema fields remain available in Structure and the content inspector.

Choose **Use template** to open the fictional résumé. Click a field to select it; double-click or press Enter/F2 to edit it. Enter in a bullet adds a new item and moves the caret there. The inspector also exposes blank fields and item removal. Add permitted sections and entries, reorder them, remove them, or preview a replacement from the fictional library. Structural content commands preserve the template layout.

Switch back to template design to experiment. Returning to **Build résumé** continues using its last captured layout. **Apply layout changes** explicitly captures the edited layout while retaining résumé values and entry counts. Template section ordering is captured separately; applying a changed template order updates the résumé section order. Otherwise its own section order is retained.

Select either sample job. Hover over a field and dwell on its sparkle for 450 ms, click the sparkle, or focus it with the keyboard. Preview the sample summary or Northstar Studio bullets. An experience-entry sparkle also suggests a job-relevant library replacement. Unsupported targets show an honest empty state. Applying checks that the exact target and selected job still match the preview. Each apply or replacement is one undo step.

## Implementation boundaries

Every implementation module begins with `DEMO ONLY`. Shared-shell additions have a demo-only comment. Demo types, fixtures, providers, and storage keys use the `Demo` or `demo` prefix.

| Area | Responsibility |
| --- | --- |
| `apps/web/src/routes/demo.visual-editor.tsx` | Authentication/environment gate and existing workspace shell |
| `apps/web/src/components/demo/visual-editor/demo-model.ts` | Local layout tree, fixed schema bindings, record identities, validation |
| `demo-fixtures.ts`, `demo-suggestions.ts` | Fictional records, two jobs, deterministic wording/replacement scripts |
| `demo-document.ts`, `demo-editor.tsx` | Tiptap custom field/container/section/entry nodes and React node views |
| `demo-layout-inspector.tsx`, `demo-drag.ts` | Nested layout controls and pointer/keyboard movement |
| `demo-state.ts`, `demo-storage.ts` | Session undo/redo and versioned browser-local persistence |
| `demo-page.tsx`, `demo.css` | Demo interface and scoped presentation |

Schema references come from River's built-in schema bundle. Demo records reuse the content-record identity/reference concepts. Values are display strings with stable list-item IDs, not River's production typed date/number serialization. Visual layout JSON is local to this demo and does not replace the production LaTeX layout contract.

Tiptap projects layouts plus records into one continuous document. Text transactions map back through record, field, and list-item identities. A transaction filter blocks arbitrary structural mutations in résumé mode. Ordinary typing acknowledges the current projection without replacing the editor document. External commands, layout changes, undo/redo, and switching modes rebuild the projection. Rich pasted content becomes plain text within the existing fields.

Storage uses `river:demo:visual-editor:v1:<authenticated-user-id>`. It contains the template experiment, captured résumé layout, values, selected job, and preview count. Unreadable or incompatible data is retained until the user chooses reset. Storage failure leaves editing available with a visible unsaved status. Reset removes only that user's demo key and seeds a fresh demo. History is bounded to 100 session-local steps; adjacent typing in one field groups within 800 ms. Refresh restores content and layouts but starts new undo history. There is no multi-tab synchronization.

## Paper and visual comparison

[River · Visual editor demo in Paper](https://app.paper.design/file/01M1PCGGJYH2EC4YRJNZSPRDZK/8-0) is a new page in the existing River file. Existing pages are preserved.

| Principal state | Artboard | Paper reference | Implementation capture |
| --- | --- | --- | --- |
| Template composition | `CFT-0` | [Template](visual-editor-demo-assets/template.png) | [Template screen](visual-editor-demo-assets/implemented-template.png) |
| Nested selection | `CKH-0` | [Selection](visual-editor-demo-assets/selection.png) | [Selection screen](visual-editor-demo-assets/implemented-selection.png) |
| Résumé with repeated entries | `CO8-0` | [Résumé](visual-editor-demo-assets/resume.png) | [Résumé screen](visual-editor-demo-assets/implemented-resume.png) |
| Suggestion preview | `CSQ-0` | [Suggestion](visual-editor-demo-assets/suggestion.png) | [Suggestion screen](visual-editor-demo-assets/implemented-suggestion.png) |

The comparison uses the 1440 × 1000 Paper viewport. The implementation retains River's real navigation, account controls, Newsreader/Instrument Sans typography, blue selection, 188 px outline, 250 px inspector, and continuous white document. The interactive inspector contains more controls than the static designs and scrolls independently. Template previews repeat both entry collections, so a two-entry preview is taller than the illustrative Paper document. Optional empty fields collapse on the canvas. On narrow screens, the outline wraps and the inspector moves below the document.

## Validation

The 28 focused tests in `apps/web/test/visual-editor-demo.test.ts` cover layout, drag, area-selection, and persistence cases: field/schema preservation, cycle prevention, unwrapping, shared entry layouts at different counts, stable text identities, structural transaction guarding, suggestion staleness, replacement/undo, entry ordering/removal, persisted-state validation, storage errors/reset isolation, and history grouping.

Browser checks exercised authenticated entry, inline typing, keyboard undo, Enter/new-bullet focus, pointer dragging, keyboard movement, nested row/column insertion, unwrapping, shared typography, explicit layout application, three education entries, replacement/undo, add/remove sections, job-aware suggestions, hover dwell, empty suggestions, stale-preview rejection, reset, and refresh restoration. Refresh restored three education entries and their 16 px degree layout, while undo history correctly reset. Unavailable/corrupt-storage branches and preservation of unrelated keys are covered by focused tests; these failure modes were not injected into the browser.

Interaction follow-up: browser checks confirmed whole-section dragging and undo, the lifted preview and blue insertion line, rejected out-of-container field drops, a single selected outline, and container deletion through the button and Backspace with undo. Existing browser experiments were preserved.

All four checks passed. The browser layout was also inspected at 390 × 844 with no horizontal document overflow. Test output includes existing dependency sourcemap warnings.

Commands:

- `pnpm --filter @river/web check`
- `pnpm --filter @river/web lint`
- `pnpm --filter @river/web build`
- `pnpm --filter @river/web test test/visual-editor-demo.test.ts`

## Production work and removal

Production integration would need a versioned visual renderer/export contract, translation to production typed field values, authorized persistence and concurrency handling, a real provider boundary with reviewed proposals, and broader accessibility/input-method testing. Pagination, rich-text formatting, PDF export, collaboration, touch-specific polish, and unrestricted generation are outside this demonstration.

To remove the demo, delete its route, component directory, focused test, documentation/assets, and development navigation entry/filter. Regenerate TanStack's route tree and remove the three `@tiptap` dependencies if no other feature uses them. Browser demo keys can be deleted independently. There is no backend data or migration to undo.

## Area selection follow-up

In template mode, drag from the page margin to draw a rectangle, or choose **Area select** to start over content. Intersecting visible fields are highlighted individually; enclosing sections and containers are not also selected. List fields select as one block. Shift-click adds or removes a field. Shift-drag from the margin adds to an existing selection. Escape cancels an active rectangle and restores the previous selection; Escape outside a gesture clears selection and returns to Select mode.

The inspector offers font, alignment, and weight changes for the selection. One action creates one undo step. Selecting multiple samples of a shared entry field still updates its one shared layout definition. Area selection does not move or delete groups, and does not select hidden optional fields. Selection is session-local; layout edits retain the existing browser persistence behavior. `demo-area-selection.tsx` contains the demo-only gesture and batch-formatting boundary.

Browser checks verified margin selection across five fields, a live rectangle, retained highlights after release, batch alignment and one-step undo, Escape cancellation restoring the previous selection, explicit selection starting over content, Shift-click removal, and Escape clearing selection. Résumé checks also verified whole-entry dragging within Education and undo. Focused tests also cover rectangle intersection and batch formatting across repeated entries without changing résumé values.


## Undo and redo shortcuts

Command/Ctrl+Z undoes and Command/Ctrl+Shift+Z redoes across the demo: inline résumé fields, inspector inputs, structure controls, and canvas selection. Command/Ctrl+Y also redoes. One capture handler owns demo history so native input history and Tiptap cannot both process the same keypress. Unmodified typing, composition, Alt shortcuts, and focus on River's surrounding shell are left alone. History commands cancel an active drag first. The listener is removed when leaving the demo.

Browser checks verified both modifier combinations in inspector inputs, inline text editing, and layout controls. Tests cover key matching and ignored input combinations. `demo-history-shortcuts.tsx` is demo-only.


## Blank entries from section controls

In **Build résumé**, the plus beside a section's sparkle appends an empty entry to that section's repeating collection. This also works for a collection with no existing entries. Experience and Education get their existing shared layouts; Contact can add an empty link. The new entry is selected and scrolled into view. Its first field receives keyboard focus in read-only mode; double-click or press Enter/F2 to start typing.

Field labels appear as placeholders, not saved text. List fields start with one empty item so users can type a bullet immediately. Blank entries show their fields even before anything is typed; selected entries expose optional empty fields. Placeholder labels disappear when text is entered. The library's **Write a new entry** action also creates empty fields. Choosing a library example still inserts that example's content.

The blank-entry factory and projection remain demo-only. No schemas or production records change. Browser checks verified Education and Experience addition, all-empty content, visible placeholders, initial caret placement, typing, and entry undo/redo. Tests cover empty factories, serialization without placeholder text, target-section isolation, retained layouts, and history restoration.


## Reordering list items

In résumé mode, bullet and skill-item handles reorder siblings within the same record and list. The lifted preview and insertion line show the destination. Item IDs and text stay unchanged, so suggestions continue to target the correct item. Each reorder is one undo step. The content inspector also provides up/down buttons for each item. Field bindings and lists from other entries cannot receive the drop.

Browser checks verified moving a Northstar bullet with its preview and drop line, then restoring the original order with Command+Z. Focused tests verify identity, content, layout, scope, and undo preservation.


## Select first, then edit

In résumé mode, a single click selects a field without placing a text caret. Double-click, Enter, or F2 opens that field for editing. Escape returns focus to the selected block. Selecting another block or moving focus outside the document ends editing. The inspector's form controls remain directly editable. New entries begin selected; pressing Enter in an already open bullet continues writing in a new empty bullet.

Only the explicitly opened field can receive text transactions. Its record, field, and list-item IDs define the edit target; changes to other fields or structure are rejected. Editing state is temporary and is not persisted. Undo/redo still uses the shared demo history.

Browser checks verified single-click typing prevention, double-click editing, Enter/F2, Escape, selecting another block, undo while editing, adding a bullet with Enter, and selecting a newly added blank entry. Focused checks cover closed-field, sibling-field, cross-record, and structural transaction rejection.


## Delete and Backspace

Both keys operate on the selected block from the canvas, structure tree, or non-text inspector controls. In template mode, deleting a non-root container unwraps its fields. Fixed schema fields and entry roots stay intact, with a message explaining why they cannot be removed. Focusing a structure-tree item selects that item, so keyboard deletion targets the focused row.

In résumé mode, deletion removes a selected list item, entry, or section. Selecting a scalar field and deleting clears its value while retaining its binding. Selecting a whole list clears its items. Layout containers stay locked. Each action is undoable. Removal clears the résumé selection; holding the key cannot cascade into subsequent blocks. Active inline editing and ordinary input/textarea/select controls retain their normal text-key behavior.

Browser checks covered Delete while the inspector's Delete container button had focus, Backspace in the structure tree, bullet removal, entry removal, ordinary Backspace during inline editing, and undo restoration. Tests cover both keys, text-editing and modifier guards, identity-preserving undo, field-value clearing, and record removal. No browser experiments or unrelated documentation edits were discarded.

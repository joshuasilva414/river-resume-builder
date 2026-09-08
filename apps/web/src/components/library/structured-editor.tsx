import {
  adaptLibraryContent,
  BUILT_IN_CONTENT_REVISION,
  blockDefinitions,
  builtInSchemaBundle,
  ContentType,
  canonicalJson,
  captureSchemaBundle,
  contentTypes,
  emptyStructuredContent,
  type LibraryData,
  type LibraryKind,
  type LibraryReference,
  newId,
  type SchemaBundle,
  type SchemaReference,
  type StructuredContent,
  validateLibraryData,
} from "@river/domain";
import { Schema } from "effect";
import { useState } from "react";
import { EvidenceDialog, Failure, FormField, selectClass } from "~/components/evidence/shared";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { EditorDisclosure, revealEditorErrors } from "./editor-disclosure";
import { SavedSchemaPicker } from "./saved-schema-picker";
import { recordTitle, StructuredFields } from "./schema-fields";
import { builtInSchemaType, switchContentSchema } from "./schema-transition";
import { LibraryConflict, type LibraryDetail, useLibraryCommand } from "./shared";

function structuredStarter(kind: Exclude<LibraryKind, "content">, type: ContentType) {
  const content = emptyStructuredContent(type, newId());
  if (kind !== "block" || !["experience", "project", "education", "credential"].includes(type))
    return content;
  const schema = { id: `${type}-entry`, revision: BUILT_IN_CONTENT_REVISION };
  return {
    ...content,
    ...captureSchemaBundle(builtInSchemaBundle, schema),
    record: {
      ...content.record,
      schema,
      layout: { id: `${type}-entry-classic`, revision: BUILT_IN_CONTENT_REVISION },
      values: {},
    },
  };
}

export function StructuredLibraryEditor({
  kind,
  type: initialType,
  detail,
  seed,
  onClose,
  onSaved,
}: {
  kind: Exclude<LibraryKind, "content">;
  type: ContentType;
  detail?: LibraryDetail;
  seed?: LibraryData;
  onClose: () => void;
  onSaved: (reference: LibraryReference) => void;
}) {
  const [type, setType] = useState(initialType);
  const [original] = useState(() => {
    const legacy = seed ?? detail?.revision.data;
    if (legacy) return adaptLibraryContent(legacy, detail?.graph ?? []);
    return structuredStarter(kind, initialType);
  });
  const [content, setContent] = useState<StructuredContent>(original);
  const [label, setLabel] = useState(
    detail?.revision.label ??
      (typeof content.record.values.heading === "string"
        ? content.record.values.heading
        : type === "contact"
          ? "Contact"
          : ""),
  );
  const [error, setError] = useState<Error | null>(null);
  const chooseSchema = (bundle: SchemaBundle, schema: SchemaReference) => {
    const nextType = builtInSchemaType(schema) ?? type;
    if (detail && nextType !== type) {
      setError(new Error("Create a separate library item to use a different content type."));
      return;
    }
    setError(null);
    if (label === blockDefinitions[type].heading || label === type || label === "Contact")
      setLabel(blockDefinitions[nextType].heading || "Contact");
    setType(nextType);
    setContent(switchContentSchema(content, bundle, schema));
  };
  const save = useLibraryCommand((result) => {
    if (result.revisionId) onSaved({ itemId: result.id, revisionId: result.revisionId });
    onClose();
  });
  return (
    <EvidenceDialog
      title={`${detail ? "Edit" : "Add"} ${kind === "block" ? "entry" : "section"}`}
      description="Add your details and save once. Other résumés keep their saved content."
      onClose={onClose}
      dirty={type !== initialType || canonicalJson(content) !== canonicalJson(original)}
      pending={save.isPending}
      className="sm:max-w-[820px]"
    >
      <form
        className="space-y-6"
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          const data: LibraryData =
            kind === "block"
              ? { kind, type, fields: [], structured: content }
              : {
                  kind,
                  type,
                  heading:
                    typeof content.record.values.heading === "string"
                      ? content.record.values.heading
                      : "",
                  blocks: [],
                  structured: content,
                };
          try {
            validateLibraryData(data);
            setError(null);
            save.mutate({
              id: detail?.item.id ?? null,
              revision: detail?.item.revision ?? null,
              label: label.trim() || type,
              rationale: "",
              data,
            });
          } catch (problem) {
            revealEditorErrors(event.currentTarget);
            setError(problem instanceof Error ? problem : new Error("Check the fields."));
          }
        }}
      >
        <FormField label="Save as">
          <Input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            maxLength={160}
            required
            disabled={save.isPending}
          />
        </FormField>
        <EditorDisclosure title={recordTitle(content.record, type)} defaultOpen={!detail}>
          <StructuredFields content={content} onChange={setContent} disabled={save.isPending} />
        </EditorDisclosure>
        <EditorDisclosure title="Section settings">
          {!detail && (
            <FormField label="Content type">
              <select
                className={selectClass}
                value={type}
                disabled={save.isPending}
                onChange={(event) => {
                  const nextType = Schema.decodeUnknownSync(ContentType)(event.target.value);
                  const starter = structuredStarter(kind, nextType);
                  chooseSchema(starter, starter.record.schema);
                }}
              >
                {contentTypes.map((value) => (
                  <option key={value} value={value}>
                    {blockDefinitions[value].label}
                  </option>
                ))}
              </select>
            </FormField>
          )}
          <SavedSchemaPicker
            level={kind === "block" ? "entry" : "section"}
            disabled={save.isPending}
            onPick={chooseSchema}
          />
        </EditorDisclosure>
        <Failure error={error} />
        <LibraryConflict
          id={detail?.item.id ?? null}
          error={save.error}
          local={<p>Your entries remain in this editor.</p>}
          onReload={onClose}
        />
        <div className="sticky bottom-0 flex justify-end gap-3 border-t bg-background py-4">
          <Button type="button" variant="outline" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button disabled={save.isPending}>
            {save.isPending ? "Saving…" : kind === "block" ? "Save entry" : "Save section"}
          </Button>
        </div>
      </form>
    </EvidenceDialog>
  );
}

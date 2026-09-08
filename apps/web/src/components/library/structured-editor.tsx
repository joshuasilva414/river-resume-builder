import {
  adaptLibraryContent,
  builtInSchemaBundle,
  type ContentType,
  canonicalJson,
  captureSchemaBundle,
  emptyStructuredContent,
  type LibraryData,
  type LibraryKind,
  type LibraryReference,
  newId,
  type StructuredContent,
  validateLibraryData,
} from "@river/domain";
import { useState } from "react";
import { EvidenceDialog, Failure, FormField } from "~/components/evidence/shared";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { SavedSchemaPicker } from "./saved-schema-picker";
import { StructuredFields } from "./schema-fields";
import { savedSchemaSnapshots, switchContentSchema } from "./schema-transition";
import { LibraryConflict, type LibraryDetail, useLibraryCommand } from "./shared";

export function StructuredLibraryEditor({
  kind,
  type,
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
  const [original] = useState(() => {
    const legacy = seed ?? detail?.revision.data;
    if (legacy) return adaptLibraryContent(legacy, detail?.graph ?? []);
    const content = emptyStructuredContent(type, newId());
    if (kind === "block" && ["experience", "project", "education", "credential"].includes(type)) {
      const schema = { id: `${type}-entry`, revision: 1 };
      return {
        ...content,
        ...captureSchemaBundle(builtInSchemaBundle, schema),
        record: {
          ...content.record,
          schema,
          layout: { id: `${type}-entry-classic`, revision: 1 },
          values: {},
        },
      };
    }
    return content;
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
  const save = useLibraryCommand((result) => {
    if (result.revisionId) onSaved({ itemId: result.id, revisionId: result.revisionId });
    onClose();
  });
  return (
    <EvidenceDialog
      title={`${detail ? "Edit" : "Add"} ${kind === "block" ? "entry" : "section"}`}
      description="Add your details and save once. Other résumés keep their saved content."
      onClose={onClose}
      dirty={canonicalJson(content) !== canonicalJson(original)}
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
        <SavedSchemaPicker
          level={kind === "block" ? "entry" : "section"}
          disabled={save.isPending}
          onPick={(bundle, schema) => {
            setContent(switchContentSchema(content, bundle, schema));
          }}
        />
        {savedSchemaSnapshots(content).length > 0 && (
          <details className="space-y-3 rounded-md border p-4">
            <summary className="cursor-pointer text-sm font-semibold">
              Previous fields and values
            </summary>
            <p className="text-sm text-muted-foreground">
              Restore the fields and values from before a schema change. Your current values will
              also be kept here.
            </p>
            {savedSchemaSnapshots(content).map((snapshot) => (
              <Button
                key={canonicalJson({
                  schema: snapshot.record.schema,
                  schemas: snapshot.schemas,
                  layouts: snapshot.layouts,
                })}
                type="button"
                variant="outline"
                disabled={save.isPending}
                onClick={() =>
                  setContent(switchContentSchema(content, snapshot, snapshot.record.schema))
                }
              >
                Restore{" "}
                {snapshot.schemas.find(
                  (item) =>
                    item.id === snapshot.record.schema.id &&
                    item.revision === snapshot.record.schema.revision,
                )?.name ?? "saved fields"}
              </Button>
            ))}
          </details>
        )}
        <StructuredFields content={content} onChange={setContent} disabled={save.isPending} />
        <Failure error={error} />
        <LibraryConflict
          id={detail?.item.id ?? null}
          error={save.error}
          local={<p>Your entries remain in this editor.</p>}
          onReload={onClose}
        />
        <div className="flex justify-end gap-3 border-t pt-5">
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

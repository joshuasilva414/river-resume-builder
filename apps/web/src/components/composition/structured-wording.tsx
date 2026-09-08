import {
  type Composition,
  canonicalJson,
  captureWordingTarget,
  replaceStructuredWording,
  type StructuredContent,
  type StructuredWordingPath,
  structuredWordingPaths,
  type WordingPath,
} from "@river/domain";
import { Fragment, type ReactNode, useState } from "react";
import { EvidenceDialog, FormField, selectClass } from "~/components/evidence/shared";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";

/** Uses the shared wording review and batch queue for real schema fields. */
export function StructuredWording({
  content,
  sectionId,
  blockId = null,
  disabled,
  onSuggest,
  inlineFor,
}: {
  content: StructuredContent;
  sectionId: string;
  blockId?: string | null;
  disabled: boolean;
  onSuggest: (path: WordingPath) => void;
  inlineFor: (path: WordingPath) => ReactNode;
}) {
  const fields = structuredWordingPaths(content, sectionId, blockId);
  const [selected, setSelected] = useState("");
  const target = fields.find((item) => canonicalJson(item.path) === selected) ?? fields[0];
  if (!target) return null;
  return (
    <div className="space-y-4 border-t pt-5">
      <FormField label="Wording to improve">
        <select
          className={selectClass}
          value={canonicalJson(target.path)}
          disabled={disabled}
          onChange={(event) => setSelected(event.target.value)}
        >
          {fields.map((item) => (
            <option key={canonicalJson(item.path)} value={canonicalJson(item.path)}>
              {item.label}
            </option>
          ))}
        </select>
      </FormField>
      <p className="whitespace-pre-wrap text-sm text-muted-foreground">{target.wording}</p>
      <Button variant="outline" disabled={disabled} onClick={() => onSuggest(target.path)}>
        Suggest wording
      </Button>
      {fields.map((item) => (
        <Fragment key={canonicalJson(item.path)}>{inlineFor(item.path)}</Fragment>
      ))}
    </div>
  );
}

export function StructuredWordingEditor({
  data,
  path,
  onApply,
  onClose,
}: {
  data: Composition;
  path: StructuredWordingPath;
  onApply: (data: Composition) => void;
  onClose: () => void;
}) {
  const target = captureWordingTarget(data, [], path);
  const [wording, setWording] = useState(target.content.wording);
  return (
    <EvidenceDialog
      title="Edit wording"
      description="Change this field in the current résumé. Other entries and saved library content keep their values."
      dirty={wording !== target.content.wording}
      onClose={onClose}
    >
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          onApply(replaceStructuredWording(data, path, wording));
        }}
      >
        <FormField label={target.field}>
          <Textarea
            value={wording}
            onChange={(event) => setWording(event.target.value)}
            maxLength={10000}
            rows={6}
            required
          />
        </FormField>
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!wording.trim()}>Apply wording</Button>
        </div>
      </form>
    </EvidenceDialog>
  );
}

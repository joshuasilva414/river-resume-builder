import type { ReviewedComparisonOrigin, SourceCandidateOrigin } from "@river/contracts";
import { canonicalJson, type EvidenceMaterialInput, EvidenceType } from "@river/domain";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { getSources } from "~/server/functions";
import {
  type EvidenceDetail,
  EvidenceDialog,
  Failure,
  FormField,
  selectClass,
  unwrap,
  useEvidenceCommand,
} from "./shared";

export function ClaimEditor({
  detail,
  mergeSource,
  initialMaterial,
  originCandidate,
  comparisonOrigin,
  onClose,
  onSaved,
}: {
  detail?: EvidenceDetail;
  mergeSource?: EvidenceDetail;
  initialMaterial?: EvidenceMaterialInput;
  originCandidate?: SourceCandidateOrigin;
  comparisonOrigin?: ReviewedComparisonOrigin;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const original =
    detail?.revisions.find((item) => item.id === detail.claim.currentRevisionId)?.material ??
    initialMaterial;
  const other = mergeSource?.revisions.find(
    (item) => item.id === mergeSource.claim.currentRevisionId,
  )?.material;
  const [text, setText] = useState(original?.assertion ?? "");
  const [type, setType] = useState<EvidenceType>(detail?.claim.metadata.type ?? "Other");
  const [keywords, setKeywords] = useState(detail?.claim.metadata.tags.join(", ") ?? "");
  const [sourceIds, setSourceIds] = useState<readonly string[]>([
    ...new Set([
      ...(original?.sourceIds ?? []),
      ...(original?.citations.map((item) => item.sourceId) ?? []),
      ...(other?.sourceIds ?? []),
      ...(other?.citations.map((item) => item.sourceId) ?? []),
    ]),
  ]);
  const [initialSources] = useState(sourceIds);
  const sources = useQuery({
    queryKey: ["sources"],
    queryFn: async () => unwrap(await getSources()),
  });
  const save = useEvidenceCommand((result) => {
    onSaved(result.id);
    onClose();
  });
  const dirty =
    canonicalJson(sourceIds) !== canonicalJson(initialSources) ||
    text !== (original?.assertion ?? "") ||
    keywords !== (detail?.claim.metadata.tags.join(", ") ?? "") ||
    type !== (detail?.claim.metadata.type ?? "Other");
  return (
    <EvidenceDialog
      title={mergeSource ? "Combine evidence" : detail ? "Edit evidence" : "Add evidence"}
      description="Save text, a type, and keywords. Sources are optional. Saved evidence is ready to use."
      onClose={onClose}
      pending={save.isPending}
      dirty={dirty}
    >
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          const citations = [...(original?.citations ?? []), ...(other?.citations ?? [])].filter(
            (item, index, all) =>
              sourceIds.includes(item.sourceId) &&
              all.findIndex((row) => canonicalJson(row) === canonicalJson(item)) === index,
          );
          const material = {
            assertion: text.trim(),
            citations,
            sourceIds,
            contexts: original?.contexts ?? [],
          };
          const metadata = {
            ...detail?.claim.metadata,
            label: detail?.claim.metadata.label ?? "",
            notes: detail?.claim.metadata.notes ?? "",
            type,
            tags: [
              ...new Set(
                keywords
                  .split(",")
                  .map((value) => value.trim())
                  .filter(Boolean),
              ),
            ],
          };
          if (detail && mergeSource)
            save.mutate({
              type: "merge",
              id: detail.claim.id,
              revision: detail.claim.revision,
              sourceId: mergeSource.claim.id,
              sourceRevision: mergeSource.claim.revision,
              material,
              comparisonOrigin,
            });
          else if (detail)
            save.mutate({
              type: "edit",
              id: detail.claim.id,
              revision: detail.claim.revision,
              material,
              metadata,
            });
          else save.mutate({ type: "create", material, metadata, originCandidate });
        }}
      >
        <FormField label="Type">
          <select
            className={selectClass}
            value={type}
            onChange={(event) => {
              const value = EvidenceType.literals.find((item) => item === event.target.value);
              if (value) setType(value);
            }}
          >
            {EvidenceType.literals.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </FormField>
        <FormField label={type === "Skill" ? "Skill name" : "Evidence text"}>
          <Textarea
            required
            maxLength={4000}
            value={text}
            onChange={(event) => setText(event.target.value)}
            className="min-h-36"
            placeholder={type === "Skill" ? "TypeScript" : "Built…"}
          />
        </FormField>
        <FormField label="Keywords">
          <Input
            value={keywords}
            onChange={(event) => setKeywords(event.target.value)}
            placeholder="Separate keywords with commas"
          />
        </FormField>
        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">Sources (optional)</legend>
          {!sources.data?.length && (
            <p className="text-sm text-muted-foreground">
              You can save this evidence without a source.
            </p>
          )}
          <div className="max-h-36 overflow-y-auto">
            {sources.data
              ?.filter((source) => !source.archivedAt || sourceIds.includes(source.id))
              .map((source) => (
                <label key={source.id} className="flex min-h-11 items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={sourceIds.includes(source.id)}
                    onChange={(event) =>
                      setSourceIds((ids) =>
                        event.target.checked
                          ? [...ids, source.id]
                          : ids.filter((id) => id !== source.id),
                      )
                    }
                  />
                  {source.title}
                  {source.archivedAt ? " · In Trash" : ""}
                </label>
              ))}
          </div>
        </fieldset>
        <Failure error={save.error ?? sources.error} />
        {save.error && detail && (
          <p className="text-sm">
            Close and reopen this item to load the latest saved text. Your changes are still shown
            here.
          </p>
        )}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button type="submit" disabled={save.isPending || !text.trim()}>
            {save.isPending ? "Saving…" : "Save evidence"}
          </Button>
        </div>
      </form>
    </EvidenceDialog>
  );
}

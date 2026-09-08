import {
  type ContentPlacement,
  canonicalJson,
  contentValue,
  type LibraryGraphNode,
  resolveLibrary,
} from "@river/domain";
import { useState } from "react";
import { EvidenceDialog, FormField } from "~/components/evidence/shared";
import { EvidenceLinks } from "~/components/library/evidence-links";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
export function WordingEditor({
  content,
  graph,
  onClose,
  onApply,
}: {
  content: ContentPlacement;
  graph: readonly LibraryGraphNode[];
  onClose: () => void;
  onApply: (value: ContentPlacement) => void;
}) {
  const [original] = useState(content),
    base = resolveLibrary(original.reference, graph),
    value = contentValue(original, graph);
  const [wording, setWording] = useState(value.wording),
    [evidence, setEvidence] = useState(value.evidence),
    [reason] = useState(content.override?.reason ?? "Edited wording"),
    [compare, setCompare] = useState(false);
  if (base.kind !== "content") return null;
  return (
    <EvidenceDialog
      title="Edit wording in this résumé"
      description="Changes apply to this résumé. Reusable content and other résumés keep their saved wording."
      onClose={onClose}
      dirty={
        canonicalJson({ wording, evidence, reason }) !==
        canonicalJson({
          wording: value.wording,
          evidence: value.evidence,
          reason: original.override?.reason ?? "Edited wording",
        })
      }
      wide
    >
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          onApply({ ...original, override: { wording, evidence, reason } });
          onClose();
        }}
      >
        <FormField label="Complete local wording">
          <Textarea
            required
            maxLength={10000}
            className="min-h-36"
            value={wording}
            onChange={(event) => setWording(event.target.value)}
          />
        </FormField>
        <EvidenceLinks value={evidence} onChange={setEvidence} />
        <Button type="button" variant="outline" onClick={() => setCompare(!compare)}>
          {compare ? "Hide base wording" : "Compare base wording"}
        </Button>
        {compare && (
          <section className="space-y-4 border-y py-4">
            <h3 className="font-sans font-semibold">Original pinned wording</h3>
            <p className="whitespace-pre-wrap">{base.wording}</p>
            <EvidenceLinks value={base.evidence} />
            {original.override && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  onApply({ ...original, override: null });
                  onClose();
                }}
              >
                Replace local wording and evidence with base
              </Button>
            )}
          </section>
        )}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!wording.trim()}>Apply local wording</Button>
        </div>
      </form>
    </EvidenceDialog>
  );
}

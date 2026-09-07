import {
  type BlockFieldKey,
  blockDefinitions,
  type ContentType,
  canonicalJson,
  contentTypes,
} from "@river/domain";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { addLibraryStarter } from "~/server/library-functions";
import { EvidenceDialog, Failure, FormField, unwrap } from "../evidence/shared";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";

export function LibraryStarters({ onSaved }: { onSaved: (id: string) => void }) {
  const [type, setType] = useState<ContentType | null>(null);
  return (
    <section className="space-y-4 border-b px-5 py-6 md:px-8" aria-label="Resume starters">
      <div>
        <h2 className="text-lg font-semibold">Start with the essentials</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose a ready-made structure and add your own details. Save it once to reuse across
          résumés.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {contentTypes.map((item) => (
          <Button
            key={item}
            variant="outline"
            className="h-auto min-h-14 justify-start whitespace-normal py-3 text-left"
            onClick={() => setType(item)}
          >
            {blockDefinitions[item].label}
          </Button>
        ))}
      </div>
      {type && (
        <StarterEditor key={type} type={type} onClose={() => setType(null)} onSaved={onSaved} />
      )}
    </section>
  );
}

function StarterEditor({
  type,
  onClose,
  onSaved,
}: {
  type: ContentType;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const definition = blockDefinitions[type],
    client = useQueryClient();
  const [label, setLabel] = useState<string>(definition.label),
    [fields, setFields] = useState<Partial<Record<BlockFieldKey, string>>>({});
  const command = useRef<{ payload: string; key: string } | null>(null);
  const save = useMutation({
    mutationFn: async () => {
      const input = {
        type,
        label,
        fields: definition.fields.map((slot) => ({
          key: slot.key,
          values:
            slot.max === 1
              ? fields[slot.key]?.trim()
                ? [fields[slot.key]?.trim() ?? ""]
                : []
              : (fields[slot.key] ?? "")
                  .split("\n")
                  .map((value) => value.trim())
                  .filter(Boolean),
        })),
      };
      const payload = canonicalJson(input);
      if (command.current?.payload !== payload)
        command.current = { payload, key: crypto.randomUUID() };
      return unwrap(
        await addLibraryStarter({ data: { ...input, idempotencyKey: command.current.key } }),
      );
    },
    onSuccess: async (result) => {
      await client.invalidateQueries({ queryKey: ["library"] });
      onSaved(result.id);
      onClose();
    },
  });
  return (
    <EvidenceDialog
      title={`Add ${definition.label.toLowerCase()}`}
      description="Enter your own wording. Nothing is added until you save."
      onClose={onClose}
      dirty={Object.values(fields).some(Boolean)}
      pending={save.isPending}
    >
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <FormField label="Save as">
          <Input
            value={label}
            maxLength={160}
            required
            disabled={save.isPending}
            onChange={(event) => setLabel(event.target.value)}
          />
        </FormField>
        {definition.fields.map((slot) => (
          <div key={slot.key} className="space-y-2">
            <FormField label={slot.label}>
              {slot.max === 1 ? (
                <Input
                  required={slot.min > 0}
                  value={fields[slot.key] ?? ""}
                  maxLength={10000}
                  disabled={save.isPending}
                  onChange={(event) => setFields({ ...fields, [slot.key]: event.target.value })}
                />
              ) : (
                <Textarea
                  required={slot.min > 0}
                  value={fields[slot.key] ?? ""}
                  rows={4}
                  maxLength={30000}
                  disabled={save.isPending}
                  onChange={(event) => setFields({ ...fields, [slot.key]: event.target.value })}
                />
              )}
            </FormField>
            {slot.max > 1 && (
              <p className="text-xs text-muted-foreground">Enter one item per line.</p>
            )}
          </div>
        ))}
        <p className="text-sm text-muted-foreground">
          Your wording stays unverified until you link and review its supporting evidence.
        </p>
        <Failure error={save.error} />
        <Button disabled={save.isPending}>{save.isPending ? "Saving…" : "Save to library"}</Button>
      </form>
    </EvidenceDialog>
  );
}

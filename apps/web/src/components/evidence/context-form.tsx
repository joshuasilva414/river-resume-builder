import { type ContextData, canonicalJson } from "@river/domain";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { DialogClose } from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import {
  EvidenceDialog,
  Failure,
  FormField,
  RequestFailure,
  type SavedContext,
  selectClass,
  useContexts,
  useEvidenceCommand,
} from "./shared";

const kinds: ContextData["kind"][] = [
  "Owner Profile",
  "Employment",
  "Project",
  "Education",
  "Credential",
];
const blank: ContextData = {
  kind: "Project",
  label: "",
  organization: "",
  role: "",
  startDate: "",
  endDate: "",
  details: "",
  contact: null,
};
export function ContextForm({
  context,
  onSaved,
  onBusy,
  onDirty,
}: {
  context?: SavedContext;
  onSaved: (id: string) => void;
  onBusy: (busy: boolean) => void;
  onDirty?: () => void;
}) {
  const [data, setData] = useState(context?.data ?? blank);
  const [observed, setObserved] = useState(context);
  const [compare, setCompare] = useState(false);
  const contexts = useContexts();
  const latest = contexts.data?.find((item) => item.id === context?.id);
  const save = useEvidenceCommand((result) => onSaved(result.id));
  const change = <K extends keyof ContextData>(key: K, value: ContextData[K]) => {
    setData({ ...data, [key]: value });
    onDirty?.();
  };
  const contact = data.contact ?? { email: "", phone: "", location: "", links: [] };
  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        onBusy(true);
        save.mutate(
          {
            type: "context",
            id: observed?.id ?? null,
            revision: observed?.revision ?? null,
            data: {
              ...data,
              contact:
                data.kind === "Owner Profile"
                  ? { ...contact, links: contact.links.map((link) => link.trim()).filter(Boolean) }
                  : null,
            },
          },
          { onSettled: () => onBusy(false) },
        );
      }}
    >
      <FormField label="Context kind">
        <select
          className={selectClass}
          disabled={Boolean(context)}
          value={data.kind}
          onChange={(event) => {
            const kind = kinds.find((kind) => kind === event.target.value);
            if (kind) change("kind", kind);
          }}
        >
          {kinds.map((kind) => (
            <option key={kind}>{kind}</option>
          ))}
        </select>
      </FormField>
      <FormField label={data.kind === "Owner Profile" ? "Name" : "Label"}>
        <Input
          required
          maxLength={200}
          value={data.label}
          onChange={(event) => change("label", event.target.value)}
        />
      </FormField>
      {data.kind === "Owner Profile" ? (
        <>
          {(["email", "phone", "location"] as const).map((key) => (
            <FormField key={key} label={key[0]?.toUpperCase() + key.slice(1)}>
              <Input
                maxLength={200}
                type={key === "email" ? "email" : "text"}
                value={contact[key]}
                onChange={(event) => change("contact", { ...contact, [key]: event.target.value })}
              />
            </FormField>
          ))}
          <FormField label="Websites (one per line)">
            <Textarea
              value={contact.links.join("\n")}
              onChange={(event) =>
                change("contact", { ...contact, links: event.target.value.split("\n") })
              }
            />
          </FormField>
        </>
      ) : (
        <>
          <FormField label="Organization">
            <Input
              maxLength={200}
              value={data.organization}
              onChange={(event) => change("organization", event.target.value)}
            />
          </FormField>
          <FormField label="Role or qualification">
            <Input
              maxLength={200}
              value={data.role}
              onChange={(event) => change("role", event.target.value)}
            />
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            {(["startDate", "endDate"] as const).map((key) => (
              <FormField key={key} label={key === "startDate" ? "Start" : "End"}>
                <Input
                  maxLength={32}
                  value={data[key]}
                  onChange={(event) => change(key, event.target.value)}
                  placeholder="Month / year"
                />
              </FormField>
            ))}
          </div>
        </>
      )}
      <FormField label="Details">
        <Textarea
          maxLength={4000}
          value={data.details}
          onChange={(event) => change("details", event.target.value)}
        />
      </FormField>
      <p className="text-sm text-muted-foreground">
        Saving creates an immutable context revision. Existing claims keep their selected revision.
      </p>
      <Failure error={save.error} />
      {save.error instanceof RequestFailure && save.error.problem.code === "Conflict" && (
        <div className="space-y-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setCompare(!compare);
              if (!compare) void contexts.refetch();
            }}
          >
            {compare ? "Keep editing" : "Compare versions"}
          </Button>
          {compare && latest && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="eyebrow">Unsaved context</p>
                <pre className="whitespace-pre-wrap break-words font-sans text-sm">
                  {JSON.stringify(data, null, 2)}
                </pre>
              </div>
              <div>
                <p className="eyebrow">Saved context / {latest.revision}</p>
                <pre className="whitespace-pre-wrap break-words font-sans text-sm">
                  {JSON.stringify(latest.data, null, 2)}
                </pre>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setObserved(latest);
                    setData(latest.data);
                    setCompare(false);
                    save.reset();
                  }}
                >
                  Discard local changes and reload
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
      <div className="flex flex-wrap justify-end gap-3 border-t pt-5">
        <DialogClose asChild>
          <Button type="button" variant="outline" disabled={save.isPending}>
            Back
          </Button>
        </DialogClose>
        <Button
          disabled={
            !data.label.trim() ||
            save.isPending ||
            canonicalJson(data) === canonicalJson(observed?.data ?? null)
          }
        >
          {save.isPending ? "Saving…" : "Save context"}
        </Button>
      </div>
    </form>
  );
}
export function ContextDialog({
  context,
  onClose,
}: {
  context?: SavedContext;
  onClose: () => void;
}) {
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <EvidenceDialog
      title={context ? "Edit context" : "New context"}
      description="Keep the background behind related claims together."
      onClose={onClose}
      dirty={dirty}
      pending={busy}
    >
      <ContextForm
        context={context}
        onSaved={onClose}
        onBusy={setBusy}
        onDirty={() => setDirty(true)}
      />
    </EvidenceDialog>
  );
}

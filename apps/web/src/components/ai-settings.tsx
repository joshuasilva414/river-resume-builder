import {
  type AiProvider,
  type AiSelection,
  aiProviderLabels,
  aiProviders,
  newId,
  type WorkspacePreferences,
} from "@river/domain";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  connectAiProvider,
  disconnectAiProvider,
  getAiModels,
  updateWorkspacePreferences,
} from "~/server/ai-settings-functions";
import { AiModelPicker, useAiSettings } from "./ai-selection";
import { EvidenceDialog, Failure, FormField, unwrap } from "./evidence/shared";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

export function AiSettings() {
  const query = useAiSettings(),
    client = useQueryClient();
  const [editing, setEditing] = useState<AiProvider | null>(null),
    [apiKey, setApiKey] = useState(""),
    [commandKey, setCommandKey] = useState(newId),
    [reservedId, setReservedId] = useState(newId),
    [selection, setSelection] = useState<AiSelection | null>();
  const connection = query.data?.connections.find((item) => item.provider === editing);
  const refresh = () => client.invalidateQueries();
  const save = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      return unwrap(
        await connectAiProvider({
          data: {
            id: connection?.id ?? reservedId,
            revision: connection?.revision ?? null,
            provider: editing,
            apiKey,
            idempotencyKey: commandKey,
          },
        }),
      );
    },
    onSuccess: async () => {
      setApiKey("");
      setEditing(null);
      await refresh();
    },
  });
  const remove = useMutation({
    mutationFn: async () => {
      if (!connection) return;
      return unwrap(
        await disconnectAiProvider({
          data: { id: connection.id, revision: connection.revision, idempotencyKey: commandKey },
        }),
      );
    },
    onSuccess: async () => {
      setEditing(null);
      setApiKey("");
      setSelection(undefined);
      client.removeQueries({ queryKey: ["ai-models"] });
      await refresh();
    },
  });
  const preferences = useMutation({
    mutationFn: async (next: WorkspacePreferences) => {
      if (!query.data) return;
      return unwrap(
        await updateWorkspacePreferences({
          data: { preferences: next, revision: query.data.revision, idempotencyKey: newId() },
        }),
      );
    },
    onSuccess: refresh,
  });
  const test = useMutation({
    mutationFn: async () =>
      connection ? unwrap(await getAiModels({ data: { id: connection.id } })) : [],
  });
  const busy = save.isPending || remove.isPending || test.isPending;
  const closeEditor = () => {
    setEditing(null);
    setApiKey("");
  };
  return (
    <div className="space-y-7 px-6 py-10 md:px-10 xl:px-20">
      <div>
        <h2 className="font-serif text-[32px] leading-9 md:text-[40px] md:leading-[44px]">
          AI connections
        </h2>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          Bring your own API key to get suggestions in River. Your provider bills your usage. You
          review suggestions before they change your résumé.
        </p>
      </div>
      <Failure error={query.error} />
      {query.isPending && <p role="status">Loading connections…</p>}
      {query.data && (
        <>
          {!query.data.available && (
            <p role="status" className="rounded-md border p-4">
              AI connections are temporarily unavailable. You can continue building manually.
            </p>
          )}
          <div className="grid items-start gap-12 xl:grid-cols-[minmax(0,1fr)_352px]">
            <section className="divide-y rounded-lg border">
              {aiProviders.map((provider) => {
                const label = aiProviderLabels[provider];
                const saved = query.data.connections.find((item) => item.provider === provider);
                return (
                  <div
                    key={provider}
                    className="flex flex-wrap items-center justify-between gap-4 p-6"
                  >
                    <div>
                      <h3 className="text-base font-semibold">{label}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {saved ? `Connected · key ending ${saved.keySuffix}` : "Not connected"}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      disabled={busy || !query.data.available}
                      onClick={() => {
                        setEditing(provider);
                        setApiKey("");
                        setCommandKey(newId());
                        setReservedId(newId());
                        save.reset();
                        remove.reset();
                        test.reset();
                      }}
                    >
                      {saved ? "Manage" : "Connect"}
                    </Button>
                  </div>
                );
              })}
            </section>
            <section className="space-y-[18px] rounded-lg border p-6">
              <h3 className="font-serif text-[28px] leading-8">Your default AI</h3>
              <p className="text-sm text-muted-foreground">
                Used for new suggestions. You can choose a different model for an individual action.
              </p>
              <AiModelPicker
                key={query.data.revision}
                value={selection === undefined ? query.data.preferences.defaultAi : selection}
                onChange={setSelection}
                disabled={preferences.isPending}
              />
              <Button
                disabled={!selection || preferences.isPending}
                onClick={() =>
                  selection &&
                  preferences.mutate({ ...query.data.preferences, defaultAi: selection })
                }
              >
                {preferences.isPending ? "Saving…" : "Save default"}
              </Button>
              <Failure error={preferences.error} />
            </section>
          </div>
          {editing && (
            <EvidenceDialog
              title={`${connection ? "Manage" : "Connect"} ${aiProviderLabels[editing]}`}
              description="Use your own provider account for AI suggestions."
              dirty={Boolean(apiKey)}
              pending={busy}
              onClose={closeEditor}
            >
              <form
                className="space-y-5"
                onSubmit={(event) => {
                  event.preventDefault();
                  save.mutate();
                }}
              >
                <FormField label={connection ? "Replacement API key" : "API key"}>
                  <Input
                    type="password"
                    autoComplete="off"
                    value={apiKey}
                    onChange={(event) => {
                      setApiKey(event.target.value);
                      setCommandKey(newId());
                    }}
                    required
                    disabled={busy}
                    maxLength={4096}
                  />
                </FormField>
                <p className="text-sm text-muted-foreground">
                  Your key is encrypted on the server and never shown again. Testing checks your
                  connection and available models.
                </p>
                <Failure error={save.error ?? remove.error ?? test.error} />
                <div className="flex flex-wrap gap-3">
                  <Button type="submit" disabled={busy || !apiKey.trim()}>
                    {save.isPending ? "Testing connection…" : "Test and save"}
                  </Button>
                  <Button type="button" variant="outline" disabled={busy} onClick={closeEditor}>
                    Cancel
                  </Button>
                </div>
              </form>
              {connection && (
                <div className="space-y-3 border-t pt-5">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => test.mutate()}
                  >
                    {test.isPending ? "Testing connection…" : "Test saved connection"}
                  </Button>
                  {test.isSuccess && (
                    <p role="status" className="text-sm">
                      Connection works. {test.data.length} models available.
                    </p>
                  )}
                  <p className="text-sm">
                    Removing this connection stops future calls using this key. Saved suggestions
                    remain available.
                  </p>
                  <Button variant="destructive" disabled={busy} onClick={() => remove.mutate()}>
                    {remove.isPending ? "Removing…" : "Remove connection"}
                  </Button>
                </div>
              )}
            </EvidenceDialog>
          )}
          <p className="max-w-2xl text-sm text-muted-foreground">
            ATS scoring uses River’s separate scoring service and does not use your AI key. River’s
            usage limits still apply to AI suggestions.
          </p>
          <section className="space-y-4 border-t pt-7">
            <h3 className="text-lg font-semibold">Advanced tools</h3>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Optional tools for editing template code and inspecting document internals.
            </p>
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input
                type="checkbox"
                className="size-5"
                checked={query.data.preferences.advancedTools}
                disabled={preferences.isPending}
                onChange={(event) =>
                  preferences.mutate({
                    ...query.data.preferences,
                    advancedTools: event.target.checked,
                  })
                }
              />
              Enable advanced tools
            </label>
            {query.data.preferences.advancedTools && (
              <Link to="/advanced" className="block text-primary underline">
                Open advanced tools
              </Link>
            )}
            <Button
              variant="outline"
              disabled={preferences.isPending}
              onClick={() =>
                preferences.mutate({ ...query.data.preferences, onboardingDismissed: false })
              }
            >
              Reopen getting started
            </Button>
          </section>
        </>
      )}
    </div>
  );
}

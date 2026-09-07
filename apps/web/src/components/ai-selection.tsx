import { type AiSelection, aiProviderLabels } from "@river/domain";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useId, useState } from "react";
import { authClient } from "~/lib/auth-client";
import { getAiModels, getAiSettings } from "~/server/ai-settings-functions";
import { Failure, FormField, selectClass, unwrap } from "./evidence/shared";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

export function useAiSettings() {
  const session = authClient.useSession();
  return useQuery({
    queryKey: ["ai-settings", session.data?.user.id],
    enabled: Boolean(session.data?.user.id),
    queryFn: async () => unwrap(await getAiSettings()),
    staleTime: 30000,
  });
}

export function AiModelPicker({
  value,
  onChange,
  disabled = false,
}: {
  value?: AiSelection | null;
  onChange: (selection: AiSelection | null) => void;
  disabled?: boolean;
}) {
  const settings = useAiSettings(),
    id = useId();
  const [connectionId, setConnectionId] = useState(value?.connectionId ?? ""),
    [search, setSearch] = useState("");
  const models = useQuery({
    queryKey: [
      "ai-models",
      settings.data?.connections.find((item) => item.id === connectionId),
      connectionId,
    ],
    enabled: Boolean(connectionId),
    queryFn: async () => unwrap(await getAiModels({ data: { id: connectionId } })),
    staleTime: 300000,
    retry: false,
  });
  return (
    <div className="space-y-4">
      <FormField label="AI provider">
        <select
          aria-label="AI provider"
          className={selectClass}
          value={connectionId}
          disabled={disabled}
          onChange={(event) => {
            setConnectionId(event.target.value);
            setSearch("");
            onChange(null);
          }}
        >
          <option value="">Choose a connection</option>
          {settings.data?.connections.map((connection) => (
            <option key={connection.id} value={connection.id}>
              {aiProviderLabels[connection.provider]}
            </option>
          ))}
        </select>
      </FormField>
      {connectionId && (
        <>
          <FormField label="Find a model">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search available models"
              disabled={disabled}
              aria-controls={id}
            />
          </FormField>
          {models.isPending && (
            <p role="status" className="text-sm">
              Loading available models…
            </p>
          )}
          <Failure error={models.error} />
          {models.error && (
            <Button variant="outline" type="button" onClick={() => void models.refetch()}>
              Retry loading models
            </Button>
          )}
          {models.data && (
            <FormField label="Model">
              <select
                id={id}
                aria-label="Model"
                className={selectClass}
                disabled={disabled}
                value={value?.connectionId === connectionId ? value.model : ""}
                onChange={(event) =>
                  onChange(event.target.value ? { connectionId, model: event.target.value } : null)
                }
              >
                <option value="">Choose a model</option>
                {models.data
                  .filter((model) =>
                    `${model.label} ${model.id}`.toLowerCase().includes(search.toLowerCase()),
                  )
                  .map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.label}
                    </option>
                  ))}
              </select>
            </FormField>
          )}
          {models.data?.length === 0 && (
            <p className="text-sm">This connection has no compatible text models available.</p>
          )}
        </>
      )}
      <Failure error={settings.error} />
    </div>
  );
}

/** A change here applies to one new task, leaving the saved default unchanged. */
export function AiSelector({
  value,
  onChange,
  disabled = false,
}: {
  value?: AiSelection;
  onChange: (selection: AiSelection | undefined) => void;
  disabled?: boolean;
}) {
  const settings = useAiSettings(),
    [editing, setEditing] = useState(false);
  const selected = value ?? settings.data?.preferences.defaultAi;
  const connection = settings.data?.connections.find((item) => item.id === selected?.connectionId);
  return (
    <section className="space-y-4 rounded-lg border p-6" aria-label="AI for this action">
      {settings.isPending ? (
        <p role="status">Loading AI settings…</p>
      ) : !settings.data?.connections.length ? (
        <p className="text-sm">
          Connect your own AI provider in{" "}
          <Link to="/settings" className="text-primary underline">
            Settings
          </Link>{" "}
          to use AI assistance. You can continue manually.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">AI for this action</p>
              <p className="mt-1 break-words text-sm text-muted-foreground">
                {connection && selected
                  ? `${aiProviderLabels[connection.provider]} · ${selected.model}`
                  : "Choose a provider and model"}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              onClick={() => setEditing(!editing)}
            >
              {editing ? "Done" : "Change"}
            </Button>
          </div>
          {(editing || !selected || !connection) && (
            <AiModelPicker
              value={selected}
              onChange={(next) => {
                if (next) onChange(next);
              }}
              disabled={disabled}
            />
          )}
          {value && (
            <Button
              type="button"
              variant="link"
              disabled={disabled}
              onClick={() => onChange(undefined)}
            >
              Use saved default
            </Button>
          )}
          <p className="text-xs text-muted-foreground">
            This request uses your provider account. Model availability and charges are set by your
            provider.
          </p>
        </>
      )}
      <Failure error={settings.error} />
    </section>
  );
}

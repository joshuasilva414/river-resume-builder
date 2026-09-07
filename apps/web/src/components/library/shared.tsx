import type { InspectLibraryRequest, SaveLibraryRequest } from "@river/contracts";
import {
  blockDefinitions,
  type CommandOutcome,
  canonicalJson,
  type LibraryData,
} from "@river/domain";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useRef, useState } from "react";
import { Failure, RequestFailure, unwrap } from "~/components/evidence/shared";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { getLibraryDetail, mutateLibrary } from "~/server/library-functions";
export type LibraryDetail = Extract<
  Awaited<ReturnType<typeof getLibraryDetail>>,
  { ok: true }
>["value"];
export type LibraryNode = LibraryDetail["graph"][number];
export const kindLabels = { content: "Wording", block: "Entry", section: "Section" } as const;
export function useLibraryCommand(onSaved?: (outcome: CommandOutcome) => void) {
  const client = useQueryClient();
  const request = useRef<{ key: string; payload: string } | null>(null);
  return useMutation({
    mutationFn: async (input: Omit<SaveLibraryRequest, "idempotencyKey">) => {
      const payload = canonicalJson(input);
      if (request.current?.payload !== payload)
        request.current = { payload, key: crypto.randomUUID() };
      return unwrap(
        await mutateLibrary({ data: { ...input, idempotencyKey: request.current.key } }),
      );
    },
    onSuccess: async (outcome) => {
      await client.invalidateQueries({ queryKey: ["library"] });
      onSaved?.(outcome);
    },
    onError: (error) => {
      if (error instanceof RequestFailure && error.problem.code === "Conflict")
        void client.invalidateQueries({ queryKey: ["library"] });
    },
  });
}
export const useLibraryDetail = (input: InspectLibraryRequest | null) =>
  useQuery({
    queryKey: ["library", "detail", input],
    enabled: input !== null,
    queryFn: async () => {
      if (!input) throw Error("Choose a library item.");
      return unwrap(await getLibraryDetail({ data: input }));
    },
  });
export function LibraryDataView({
  data,
  graph,
}: {
  data: LibraryData;
  graph: readonly LibraryNode[];
}) {
  if (data.kind === "content")
    return <p className="whitespace-pre-wrap text-[15px] leading-6 break-words">{data.wording}</p>;
  if (data.kind === "block")
    return (
      <div className="space-y-4">
        {blockDefinitions[data.type].fields.map((field) => {
          const contents = data.fields.find((value) => value.key === field.key)?.contents ?? [];
          if (!contents.length) return null;
          return (
            <section key={field.key}>
              <h4 className="mb-2 font-sans text-xs font-semibold text-muted-foreground">
                {field.label}
              </h4>
              <div className="space-y-3">
                {contents.map((reference) => {
                  const entry = graph.find((node) => node.revision.id === reference.revisionId);
                  return (
                    <div key={reference.id} className="border-l-2 pl-3">
                      {entry ? (
                        <LibraryDataView data={entry.revision.data} graph={graph} />
                      ) : (
                        <p>Referenced content · {reference.revisionId.slice(-8)}</p>
                      )}
                      {entry && entry.item.currentRevisionId !== entry.revision.id && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          New library revision available · this binding stays pinned
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    );
  return (
    <section className="space-y-4">
      <h3 className="font-editorial text-2xl">{data.heading || "Contact / header"}</h3>
      {data.blocks.map((reference) => {
        const entry = graph.find((node) => node.revision.id === reference.revisionId);
        return (
          <div key={reference.id} className="border-t pt-4">
            {entry ? (
              <LibraryDataView data={entry.revision.data} graph={graph} />
            ) : (
              <p>Referenced Block · {reference.revisionId.slice(-8)}</p>
            )}
          </div>
        );
      })}
      {!data.blocks.length && (
        <p className="text-sm text-muted-foreground">No Blocks in this Section yet.</p>
      )}
    </section>
  );
}
export function LibraryConflict({
  id,
  error,
  local,
  onReload,
}: {
  id: string | null;
  error: Error | null;
  local: ReactNode;
  onReload: () => void;
}) {
  const [compare, setCompare] = useState(false);
  const latest = useLibraryDetail(compare && id ? { id } : null);
  if (!(error instanceof RequestFailure) || error.problem.code !== "Conflict")
    return <Failure error={error} />;
  return (
    <div className="space-y-4">
      <Alert>
        <AlertDescription>{error.message} Your local changes are still here.</AlertDescription>
      </Alert>
      <Button type="button" variant="outline" onClick={() => setCompare(!compare)}>
        {compare ? "Keep editing" : "Compare changes"}
      </Button>
      {compare && (
        <>
          <Failure error={latest.error} />
          {latest.data && (
            <div className="grid gap-5 border-y py-4 sm:grid-cols-2">
              <div>
                <p className="eyebrow mb-3">Your unsaved version</p>
                {local}
              </div>
              <div>
                <p className="eyebrow mb-3">Saved revision {latest.data.item.revision}</p>
                <p className="mb-3 font-medium">{latest.data.revision.label}</p>
                <LibraryDataView data={latest.data.revision.data} graph={latest.data.graph} />
                <Button
                  className="mt-4 whitespace-normal"
                  type="button"
                  variant="outline"
                  onClick={onReload}
                >
                  Discard local changes and reload
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

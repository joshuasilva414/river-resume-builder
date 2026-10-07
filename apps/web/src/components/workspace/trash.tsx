import { newIdentity, recordName } from "@river/domain/workspace";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { getWorkspaceTrash, restoreWorkspaceRecord } from "~/server/workspace";
export default function Trash() {
  const client = useQueryClient(),
    [error, setError] = useState<string | null>(null),
    [pending, setPending] = useState<string | null>(null);
  const records = useQuery({
    queryKey: ["workspace-trash"],
    queryFn: async () => {
      const result = await getWorkspaceTrash();
      if (!result.ok) throw Error(result.error.title);
      return result.value;
    },
  });
  return (
    <div className="space-y-6 p-5 lg:p-10">
      <h1 className="font-serif text-4xl">Deleted items can come back.</h1>
      <p>
        Restore facts, contexts, content, templates, and résumés. Earlier material is in{" "}
        <a href="/archive" className="text-primary">
          Previous workspace
        </a>
        .
      </p>
      {(error || records.error) && (
        <p role="alert" className="text-destructive">
          {error ?? records.error?.message}
        </p>
      )}
      {!records.isPending && !records.data?.length && (
        <p className="border border-dashed p-10 text-center">Trash is empty.</p>
      )}
      {records.data?.map((record) => (
        <article key={record.id} className="flex items-center justify-between border-b py-4">
          <div>
            <h2 className="font-serif text-2xl">{recordName(record)}</h2>
            <p className="text-sm text-muted-foreground">
              {record.kind} · deleted{" "}
              {new Date(record.deletedAt ?? record.updatedAt).toLocaleDateString()}
            </p>
          </div>
          <Button
            variant="outline"
            disabled={!!pending}
            onClick={async () => {
              setPending(record.id);
              setError(null);
              try {
                const result = await restoreWorkspaceRecord({
                  data: { id: record.id, revision: record.revision, idempotencyKey: newIdentity() },
                });
                if (!result.ok) throw Error(result.error.title);
                await Promise.all([
                  records.refetch(),
                  client.invalidateQueries({ queryKey: ["workspace"] }),
                ]);
              } catch (e) {
                setError(e instanceof Error ? e.message : "Restore failed.");
              } finally {
                setPending(null);
              }
            }}
          >
            Restore
          </Button>
        </article>
      ))}
    </div>
  );
}

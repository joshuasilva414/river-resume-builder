import type { RecordKind, SaveRecord } from "@river/domain/workspace";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import {
  getWorkspaceRecords,
  removeWorkspaceRecord,
  saveWorkspaceRecord,
} from "~/server/workspace";
export function useRecords(kind: RecordKind) {
  return useQuery({
    queryKey: ["workspace", kind],
    queryFn: async () => {
      const result = await getWorkspaceRecords({ data: kind });
      if (!result.ok) throw Error(result.error.title);
      return result.value;
    },
  });
}
export function useRecordCommands() {
  const client = useQueryClient();
  const retries = useRef(new Map<string, string>());
  const save = useMutation({
    mutationFn: async (input: SaveRecord) => {
      const identity = JSON.stringify({
        id: input.id,
        revision: input.revision,
        payload: input.payload,
      });
      const idempotencyKey = retries.current.get(identity) ?? input.idempotencyKey;
      retries.current.set(identity, idempotencyKey);
      const result = await saveWorkspaceRecord({ data: { ...input, idempotencyKey } });
      if (!result.ok) throw Error(result.error.title);
      if (retries.current.size > 50) retries.current.clear();
      return result.value;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["workspace"] }),
  });
  const remove = useMutation({
    mutationFn: async (input: { id: string; revision: number; kind: RecordKind }) => {
      const identity = `delete:${input.kind}:${input.id}:${input.revision}`;
      const idempotencyKey = retries.current.get(identity) ?? crypto.randomUUID();
      retries.current.set(identity, idempotencyKey);
      const result = await removeWorkspaceRecord({
        data: { ...input, idempotencyKey },
      });
      if (!result.ok) throw Error(result.error.title);
      return result.value;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["workspace"] }),
  });
  return { save, remove };
}

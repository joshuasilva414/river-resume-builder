import type { SaveResumeRequest } from "@river/contracts";
import { type Composition, canonicalJson } from "@river/domain";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { RequestFailure, unwrap } from "~/components/evidence/shared";
import { getResume, updateResume } from "~/server/composition-functions";
export type ResumeDetail = Extract<Awaited<ReturnType<typeof getResume>>, { ok: true }>["value"];
export function useResume(id: string) {
  return useQuery({
    queryKey: ["resumes", "detail", id],
    queryFn: async () => unwrap(await getResume({ data: { id } })),
    refetchInterval: (query) =>
      query.state.data?.request && ["Pending", "Running"].includes(query.state.data.request.state)
        ? 1500
        : false,
  });
}
/** One in-flight payload is retained across retries; each acknowledgment advances the next CAS revision. */
export function useDraft(initial: ResumeDetail) {
  const client = useQueryClient();
  const [data, setData] = useState(initial.draft.data);
  const [ack, setAck] = useState({ data: initial.draft.data, revision: initial.draft.revision });
  const [pending, setPending] = useState(false),
    [error, setError] = useState<Error | null>(null);
  const inflight = useRef<SaveResumeRequest | null>(null),
    sending = useRef(false),
    local = useRef(data),
    saved = useRef(ack);
  const past = useRef<Composition[]>([]),
    future = useRef<Composition[]>([]);
  const dirty = canonicalJson(data) !== canonicalJson(ack.data);
  // Refresh an idle view without discarding local work or rebasing a failed command.
  useEffect(() => {
    if (
      initial.draft.revision <= saved.current.revision ||
      sending.current ||
      inflight.current ||
      error ||
      canonicalJson(local.current) !== canonicalJson(saved.current.data)
    )
      return;
    local.current = initial.draft.data;
    saved.current = { data: initial.draft.data, revision: initial.draft.revision };
    past.current = [];
    future.current = [];
    setData(local.current);
    setAck(saved.current);
  }, [initial.draft.data, initial.draft.revision, error]);
  const change = useCallback((next: Composition) => {
    if (canonicalJson(next) === canonicalJson(local.current)) return;
    past.current = [...past.current.slice(-99), local.current];
    future.current = [];
    local.current = next;
    setData(next);
  }, []);
  const send = useCallback(async () => {
    if (sending.current || (!inflight.current && !local.current.name.trim())) return;
    if (!inflight.current && canonicalJson(local.current) === canonicalJson(saved.current.data))
      return;
    const request = inflight.current ?? {
      id: initial.draft.id,
      revision: saved.current.revision,
      data: local.current,
      idempotencyKey: crypto.randomUUID(),
    };
    inflight.current = request;
    sending.current = true;
    setPending(true);
    setError(null);
    try {
      const result = unwrap(await updateResume({ data: request }));
      saved.current = { data: request.data, revision: result.revision };
      setAck(saved.current);
      inflight.current = null;
      await client.invalidateQueries({ queryKey: ["resumes"] });
    } catch (error) {
      const failure =
        error instanceof Error ? error : Error("Save failed. Keep this tab open and retry.");
      setError(failure);
      if (failure instanceof RequestFailure && failure.problem.code === "InvalidInput")
        inflight.current = null;
    } finally {
      sending.current = false;
      setPending(false);
    }
  }, [client, initial.draft.id]);
  useEffect(() => {
    if (canonicalJson(data) === canonicalJson(saved.current.data) || pending || error) return;
    const timer = setTimeout(() => void send(), 600);
    return () => clearTimeout(timer);
  }, [pending, error, data, send]);
  useEffect(() => {
    if (!dirty && !pending) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, pending]);
  const reload = (detail: ResumeDetail) => {
    local.current = detail.draft.data;
    saved.current = { data: detail.draft.data, revision: detail.draft.revision };
    setData(local.current);
    setAck(saved.current);
    inflight.current = null;
    past.current = [];
    future.current = [];
    setError(null);
  };
  /** Serialize an explicit server edit with autosave and retain its exact local undo step. */
  const applyExternalEdit = async (
    perform: () => Promise<{ id: string; detail: ResumeDetail; undo: Composition | null }>,
  ) => {
    if (
      sending.current ||
      inflight.current ||
      error ||
      canonicalJson(local.current) !== canonicalJson(saved.current.data)
    )
      throw new Error("Finish saving or recovering this draft before applying wording.");
    const before = local.current;
    sending.current = true;
    setPending(true);
    try {
      const result = await perform();
      if (canonicalJson(local.current) !== canonicalJson(before)) {
        setError(
          new Error(
            "Local edits arrived while wording was being applied. Compare the local and saved drafts before continuing.",
          ),
        );
        return result.id;
      }
      // Remote sibling edits are preserved, but older full-draft undo snapshots would erase them.
      if (!result.undo || canonicalJson(result.undo) !== canonicalJson(before)) past.current = [];
      if (result.undo) past.current = [...past.current.slice(-99), result.undo];
      future.current = [];
      local.current = result.detail.draft.data;
      saved.current = { data: local.current, revision: result.detail.draft.revision };
      setData(local.current);
      setAck(saved.current);
      client.setQueryData(["resumes", "detail", initial.draft.id], result.detail);
      return result.id;
    } finally {
      sending.current = false;
      setPending(false);
    }
  };
  return {
    data,
    ack,
    pending,
    error,
    dirty,
    change,
    send,
    reload,
    applyExternalEdit,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
    undo: () => {
      const previous = past.current.pop();
      if (previous) {
        future.current.push(local.current);
        local.current = previous;
        setData(previous);
      }
    },
    redo: () => {
      const next = future.current.pop();
      if (next) {
        past.current.push(local.current);
        local.current = next;
        setData(next);
      }
    },
    clearValidation: () => {
      if (error instanceof RequestFailure && error.problem.code === "InvalidInput") setError(null);
    },
  };
}

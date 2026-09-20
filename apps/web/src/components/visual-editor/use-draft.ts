import {
  newIdentity,
  parseWorkspacePayload,
  type WorkspacePayload,
  type WorkspaceRecord,
} from "@river/domain/workspace";
import { useCallback, useEffect, useRef, useState } from "react";
import { saveWorkspaceRecord } from "~/server/workspace";

export type EditorPayload = Extract<WorkspacePayload, { kind: "template" | "resume" }>;
export type EditorRecord = Extract<WorkspaceRecord, { kind: "template" | "resume" }>;
/** A single command history owns document changes; Tiptap field transactions identify their target. */
export function useWorkspaceDraft(initial: EditorRecord, ownerId: string) {
  const [payload, setPayload] = useState<EditorPayload>(
    initial.kind === "template"
      ? { kind: "template", data: initial.data }
      : { kind: "resume", data: initial.data },
  );
  const [revision, setRevision] = useState(initial.revision),
    [status, setStatus] = useState<"loading" | "saved" | "saving" | "unsaved" | "conflict">(
      "loading",
    ),
    [error, setError] = useState<string | null>(null),
    [storageError, setStorageError] = useState<string | null>(null),
    [, setHistoryVersion] = useState(0);
  const current = useRef(payload),
    baseRevision = useRef(initial.revision),
    saved = useRef(JSON.stringify(payload)),
    past = useRef<EditorPayload[]>([]),
    future = useRef<EditorPayload[]>([]),
    lastGroup = useRef({ key: "", at: 0 }),
    inflight = useRef<Promise<boolean> | null>(null),
    retry = useRef<{ serialized: string; revision: number; key: string } | null>(null),
    initialized = useRef(false);
  const storageKey = `river.workspace-draft.v1.${ownerId}.${initial.id}`;
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const stored: unknown = JSON.parse(raw);
        if (
          typeof stored !== "object" ||
          stored === null ||
          !("revision" in stored) ||
          !("payload" in stored) ||
          typeof stored.revision !== "number"
        )
          throw Error("Unsupported draft format");
        const parsed = parseWorkspacePayload(stored.payload);
        if (parsed.kind !== initial.kind) throw Error("Draft type changed");
        if (parsed.kind === "template" || parsed.kind === "resume") {
          current.current = parsed;
          setPayload(parsed);
          if (JSON.stringify(parsed) !== saved.current) {
            baseRevision.current = stored.revision;
            if (stored.revision !== initial.revision) {
              setError(
                "This browser has edits based on an older revision. Review them, then reload the saved draft or save a separate copy.",
              );
              setStatus("conflict");
              return;
            }
            setStatus("unsaved");
            return;
          }
        }
      }
      setStatus("saved");
    } catch {
      setStorageError(
        "Browser recovery data is unavailable or unreadable. Server saving still works; keep this tab open until changes are saved.",
      );
      setStatus("saved");
    }
  }, [initial.kind, initial.revision, storageKey]);
  const remember = useCallback((next: EditorPayload) => {
    current.current = next;
    setPayload(next);
    setStatus((previous) => (previous === "conflict" ? previous : "unsaved"));
    setHistoryVersion((value) => value + 1);
  }, []);
  const change = useCallback(
    (update: (payload: EditorPayload) => EditorPayload, group = "") => {
      const before = current.current,
        next = update(before);
      if (JSON.stringify(before) === JSON.stringify(next)) return;
      const now = Date.now();
      if (!group || lastGroup.current.key !== group || now - lastGroup.current.at > 900) {
        past.current.push(before);
        if (past.current.length > 100) past.current.shift();
      }
      lastGroup.current = { key: group, at: now };
      future.current = [];
      remember(next);
    },
    [remember],
  );
  const undo = useCallback(() => {
    const previous = past.current.pop();
    if (previous) {
      future.current.push(current.current);
      lastGroup.current = { key: "", at: 0 };
      remember(previous);
    }
  }, [remember]);
  const redo = useCallback(() => {
    const next = future.current.pop();
    if (next) {
      past.current.push(current.current);
      lastGroup.current = { key: "", at: 0 };
      remember(next);
    }
  }, [remember]);
  const flush = useCallback(async (): Promise<boolean> => {
    if (inflight.current) {
      if (!(await inflight.current)) return false;
    }
    if (status === "loading" || status === "conflict") return false;
    const serialized = JSON.stringify(current.current);
    if (serialized === saved.current) {
      setStatus("saved");
      return true;
    }
    const sending = current.current,
      observed = baseRevision.current;
    const identity =
      retry.current?.serialized === serialized && retry.current.revision === observed
        ? retry.current.key
        : newIdentity();
    retry.current = { serialized, revision: observed, key: identity };
    setStatus("saving");
    const operation = (async () => {
      try {
        const result = await saveWorkspaceRecord({
          data: { id: initial.id, revision: observed, idempotencyKey: identity, payload: sending },
        });
        if (!result.ok) {
          setError(result.error.title);
          setStatus(result.error.status === 409 ? "conflict" : "unsaved");
          return false;
        }
        baseRevision.current = result.value.revision;
        setRevision(result.value.revision);
        saved.current = serialized;
        retry.current = null;
        setError(null);
        setStatus(JSON.stringify(current.current) === serialized ? "saved" : "unsaved");
        return true;
      } catch (error) {
        setError(
          error instanceof Error ? error.message : "Unable to save. Your edits remain in this tab.",
        );
        setStatus("unsaved");
        return false;
      } finally {
        inflight.current = null;
      }
    })();
    inflight.current = operation;
    return operation;
  }, [initial.id, status]);
  useEffect(() => {
    if (status === "loading") return;
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ version: 1, revision: baseRevision.current, payload }),
      );
    } catch {
      setStorageError(
        "Browser recovery storage is unavailable. Keep this tab open until the server confirms saving.",
      );
    }
    if (status !== "unsaved" || error) return;
    const timer = setTimeout(() => void flush(), 650);
    return () => clearTimeout(timer);
  }, [payload, status, error, storageKey, flush]);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (JSON.stringify(current.current) !== saved.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, []);
  return {
    payload,
    revision,
    status,
    error,
    storageError,
    change,
    undo,
    redo,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
    flush,
    retry: () => {
      setError(null);
      return flush();
    },
    discardRecovery: () => {
      // The explicit discard action must bypass the ordinary unsaved-navigation guard.
      saved.current = JSON.stringify(current.current);
      try {
        localStorage.removeItem(storageKey);
      } finally {
        window.location.reload();
      }
    },
  };
}

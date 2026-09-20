import { type AgentScope, ApplicationError, newId } from "@river/domain";
import {
  deleteRecordSchema,
  identitySchema,
  importFactsSchema,
  type RecordKind,
  recordKindSchema,
  saveRecordSchema,
} from "@river/domain/workspace";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { Effect } from "effect";
import { z } from "zod";
import { bindings, type Env } from "./env";
import { jsonResult, readJson } from "./http";
import { Actor, attempt, execute, problem, Store } from "./services";

export const recordScope = (kind: RecordKind, write = false): AgentScope => {
  const domain =
    kind === "context" || kind === "fact"
      ? "facts"
      : kind === "template"
        ? "templates"
        : kind === "content"
          ? "content"
          : "resumes";
  return `${domain}:${write ? "write" : "read"}`;
};
export const listRecords = (kind: RecordKind) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    return yield* attempt(() => store.listWorkspaceRecords(actor.ownerId, kind));
  });
export const inspectRecord = (kind: RecordKind, id: string) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    const record = yield* attempt(() => store.getWorkspaceRecord(actor.ownerId, id));
    if (record.kind !== kind)
      return yield* Effect.fail(
        new ApplicationError({ code: "NotFound", message: "This record is unavailable." }),
      );
    return record;
  });
export const saveRecord = (input: z.infer<typeof saveRecordSchema>) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    return yield* attempt(() => store.saveWorkspaceRecord(actor, input));
  });
export const removeRecord = (kind: RecordKind, input: z.infer<typeof deleteRecordSchema>) =>
  Effect.gen(function* () {
    yield* inspectRecord(kind, input.id);
    const actor = yield* Actor,
      store = yield* Store;
    return yield* attempt(() => store.deleteWorkspaceRecord(actor, input));
  });
export const importFacts = (input: z.infer<typeof importFactsSchema>) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    return yield* attempt(() => store.importWorkspaceFacts(actor, input));
  });
export const getWorkspaceRecords = createServerFn({ method: "GET" })
  .validator((input: unknown) => recordKindSchema.parse(input))
  .handler(({ data }) =>
    execute(bindings(), getRequestHeaders(), listRecords(data), recordScope(data)),
  );
export const getWorkspaceRecord = createServerFn({ method: "GET" })
  .validator((input: unknown) =>
    z.object({ id: identitySchema, kind: recordKindSchema }).parse(input),
  )
  .handler(({ data }) =>
    execute(
      bindings(),
      getRequestHeaders(),
      inspectRecord(data.kind, data.id),
      recordScope(data.kind),
    ),
  );
export const saveWorkspaceRecord = createServerFn({ method: "POST" })
  .validator((input: unknown) => saveRecordSchema.parse(input))
  .handler(({ data }) =>
    execute(
      bindings(),
      getRequestHeaders(),
      saveRecord(data),
      recordScope(data.payload.kind, true),
    ),
  );
export const removeWorkspaceRecord = createServerFn({ method: "POST" })
  .validator((input: unknown) => deleteRecordSchema.extend({ kind: recordKindSchema }).parse(input))
  .handler(({ data }) =>
    execute(
      bindings(),
      getRequestHeaders(),
      removeRecord(data.kind, data),
      recordScope(data.kind, true),
    ),
  );
export const importWorkspaceFacts = createServerFn({ method: "POST" })
  .validator((input: unknown) => importFactsSchema.parse(input))
  .handler(({ data }) =>
    execute(bindings(), getRequestHeaders(), importFacts(data), "facts:write"),
  );
export const getWorkspaceArchive = createServerFn({ method: "GET" }).handler(() =>
  execute(
    bindings(),
    getRequestHeaders(),
    Effect.gen(function* () {
      const actor = yield* Actor,
        store = yield* Store;
      return {
        manifest: yield* attempt(() => store.getWorkspaceArchive(actor.ownerId)),
        records: yield* attempt(() => store.listWorkspaceArchive(actor.ownerId)),
      };
    }),
  ),
);
export const readWorkspaceArchive = createServerFn({ method: "GET" })
  .validator((input: unknown) =>
    z.object({ id: identitySchema, category: z.string().min(1).max(80) }).parse(input),
  )
  .handler(({ data }) =>
    execute(
      bindings(),
      getRequestHeaders(),
      Effect.gen(function* () {
        const actor = yield* Actor,
          store = yield* Store;
        const record = yield* attempt(() =>
          store.readWorkspaceArchive(actor.ownerId, data.category, data.id),
        );
        return { ...record, data: JSON.stringify(record.data, null, 2) };
      }),
    ),
  );
export const cutoverWorkspace = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z.object({ idempotencyKey: z.string().min(1).max(128) }).parse(input),
  )
  .handler(({ data }) =>
    execute(
      bindings(),
      getRequestHeaders(),
      Effect.gen(function* () {
        const actor = yield* Actor,
          store = yield* Store;
        return yield* attempt(() => store.archiveLegacyWorkspace(actor, data.idempotencyKey));
      }),
    ),
  );

/** REST and MCP use the same scoped commands as the UI. Legacy payloads never enter this boundary. */
export async function workspaceHttp(request: Request, env: Env, kind: RecordKind, id?: string) {
  if (request.method === "GET") {
    if (id)
      return jsonResult(
        await execute(env, request.headers, inspectRecord(kind, id), recordScope(kind)),
      );
    return jsonResult(await execute(env, request.headers, listRecords(kind), recordScope(kind)));
  }
  const parsed = await Effect.runPromise(readJson(request, 2 * 1024 * 1024).pipe(Effect.result));
  if (parsed._tag === "Failure")
    return jsonResult({ ok: false, error: problem(parsed.failure, newId()) });
  try {
    if (request.method === "DELETE") {
      const input = deleteRecordSchema.parse(parsed.success);
      if (id && id !== input.id) throw Error("Identity mismatch");
      return jsonResult(
        await execute(env, request.headers, removeRecord(kind, input), recordScope(kind, true)),
      );
    }
    const input = saveRecordSchema.parse(parsed.success);
    if (input.payload.kind !== kind || (id && id !== input.id))
      throw Error("Type or identity mismatch");
    return jsonResult(
      await execute(env, request.headers, saveRecord(input), recordScope(kind, true)),
    );
  } catch {
    return jsonResult({
      ok: false,
      error: problem(
        new ApplicationError({
          code: "InvalidInput",
          message: "Provide a typed workspace payload, observed revision, and idempotency key.",
        }),
        newId(),
      ),
    });
  }
}

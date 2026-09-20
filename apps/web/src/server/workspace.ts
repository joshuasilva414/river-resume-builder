import { ApplicationError, newId } from "@river/domain";
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
import {
  importFacts,
  inspectRecord,
  listRecords,
  recordScope,
  removeRecord,
  saveRecord,
} from "./workspace-commands";

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

export const getWorkspaceTrash = createServerFn({ method: "GET" }).handler(() =>
  execute(
    bindings(),
    getRequestHeaders(),
    Effect.gen(function* () {
      const actor = yield* Actor,
        store = yield* Store;
      return yield* attempt(() => store.listWorkspaceTrash(actor.ownerId));
    }),
  ),
);
export const restoreWorkspaceRecord = createServerFn({ method: "POST" })
  .validator((input: unknown) => deleteRecordSchema.parse(input))
  .handler(({ data }) =>
    execute(
      bindings(),
      getRequestHeaders(),
      Effect.gen(function* () {
        const actor = yield* Actor,
          store = yield* Store;
        return yield* attempt(() => store.restoreWorkspaceRecord(actor, data));
      }),
    ),
  );

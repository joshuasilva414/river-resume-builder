import { type AgentScope, ApplicationError } from "@river/domain";
import type {
  deleteRecordSchema,
  importFactsSchema,
  RecordKind,
  saveRecordSchema,
} from "@river/domain/workspace";
import { Effect } from "effect";
import type { z } from "zod";
import { Actor, attempt, Store } from "./services";
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

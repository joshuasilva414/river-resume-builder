import { ApplicationError, canonicalJson, newId, type Principal } from "@river/domain";
import {
  type ContentNode,
  type DeleteRecord,
  type ImportFacts,
  parseWorkspacePayload,
  populated,
  type RecordKind,
  recordName,
  type SaveRecord,
  type WorkspacePayload,
  type WorkspaceRecord,
} from "@river/domain/workspace";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { conditionGuard, createCommands, type Guard, type Write } from "./commands";
import type { Database } from "./index";
import { sources } from "./schema";
import {
  workspaceRecords as records,
  workspaceRecordRevisions as revisions,
} from "./workspace-schema";

export function createWorkspaceRepository(db: Database) {
  const commands = createCommands(db);
  const read = async (ownerId: string, id: string) =>
    (
      await db
        .select()
        .from(records)
        .where(and(eq(records.ownerId, ownerId), eq(records.id, id)))
        .limit(1)
    )[0];
  const view = (row: typeof records.$inferSelect): WorkspaceRecord => ({
    ...parseWorkspacePayload(row.payload),
    id: row.id,
    revision: row.revision,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  });
  const notFound = () =>
    new ApplicationError({ code: "NotFound", message: "This workspace record is unavailable." });
  const revisionGuard = (ownerId: string, id: string, revision: number) =>
    conditionGuard(
      db,
      sql`EXISTS(SELECT 1 FROM ${records} WHERE id=${id} AND owner_id=${ownerId} AND revision=${revision} AND deleted_at IS NULL)`,
      "This record changed. Reload it before saving your changes.",
    );
  const requireWrite = (actor: Principal, kind: RecordKind) => {
    const scope =
      kind === "context" || kind === "fact"
        ? "facts:write"
        : kind === "template"
          ? "templates:write"
          : kind === "content"
            ? "content:write"
            : "resumes:write";
    if (actor.kind === "agent" && !actor.scopes.includes(scope))
      throw new ApplicationError({
        code: "Forbidden",
        message: "This credential does not allow that action.",
      });
  };
  const relationGuards = (
    ownerId: string,
    payloads: WorkspacePayload[],
    pendingContexts: string[] = [],
  ): Guard[] => {
    const guards: Guard[] = [],
      contexts = new Set<string>(),
      sourceIds = new Set<string>(),
      factIds = new Set<string>();
    const origins = (nodes: ContentNode[]) => {
      for (const node of nodes) {
        if (node.kind === "field") for (const id of node.factIds) factIds.add(id);
        else origins(node.children);
      }
    };
    for (const payload of payloads) {
      if (payload.kind === "fact") {
        if (!populated(payload.data.value))
          throw new ApplicationError({
            code: "InvalidInput",
            message: "Enter a value before saving this fact.",
          });
        const { contextId, sourceId } = payload.data;
        if (contextId && !pendingContexts.includes(contextId)) contexts.add(contextId);
        if (sourceId) sourceIds.add(sourceId);
      }
      if (payload.kind === "content") origins([payload.data.content]);
      if (payload.kind === "resume") {
        origins([...payload.data.sections, ...payload.data.unused]);
        if (payload.data.job)
          guards.push(
            conditionGuard(
              db,
              sql`EXISTS(SELECT 1 FROM job_targets WHERE id=${payload.data.job.id} AND owner_id=${ownerId})`,
              "Choose a job target in your workspace.",
            ),
          );
      }
      if (payload.kind === "version")
        guards.push(revisionGuard(ownerId, payload.data.resumeId, payload.data.draftRevision));
    }
    // JSON arrays bind once, keeping bulk imports below D1's 100-parameter limit.
    if (contexts.size)
      guards.push(
        conditionGuard(
          db,
          sql`NOT EXISTS(SELECT 1 FROM json_each(${JSON.stringify([...contexts])}) ids WHERE NOT EXISTS(SELECT 1 FROM ${records} WHERE id=ids.value AND owner_id=${ownerId} AND kind='context' AND deleted_at IS NULL))`,
          "Choose available fact contexts.",
        ),
      );
    if (sourceIds.size)
      guards.push(
        conditionGuard(
          db,
          sql`NOT EXISTS(SELECT 1 FROM json_each(${JSON.stringify([...sourceIds])}) ids WHERE NOT EXISTS(SELECT 1 FROM ${sources} WHERE id=ids.value AND owner_id=${ownerId} AND archived_at IS NULL))`,
          "Choose sources in your workspace.",
        ),
      );
    if (factIds.size)
      guards.push(
        conditionGuard(
          db,
          sql`NOT EXISTS(SELECT 1 FROM json_each(${JSON.stringify([...factIds])}) ids WHERE NOT EXISTS(SELECT 1 FROM ${records} WHERE id=ids.value AND owner_id=${ownerId} AND kind='fact'))`,
          "Originating facts must belong to your workspace.",
        ),
      );
    return guards;
  };
  return {
    async listWorkspaceRecords(ownerId: string, kind?: RecordKind) {
      const rows = await db
        .select()
        .from(records)
        .where(
          and(
            eq(records.ownerId, ownerId),
            isNull(records.deletedAt),
            kind ? eq(records.kind, kind) : undefined,
          ),
        )
        .orderBy(desc(records.updatedAt));
      return rows.map(view);
    },
    async getWorkspaceRecord(ownerId: string, id: string) {
      const row = await read(ownerId, id);
      if (!row || row.deletedAt) throw notFound();
      return view(row);
    },
    async saveWorkspaceRecord(actor: Principal, input: SaveRecord) {
      const payload = parseWorkspacePayload(input.payload);
      requireWrite(actor, payload.kind);
      if ((payload.kind === "fact" || payload.kind === "context") && payload.data.id !== input.id)
        throw new ApplicationError({
          code: "InvalidInput",
          message: "The record identity does not match its value.",
        });
      return commands.commit(actor, "workspace.save", input.idempotencyKey, input, async () => {
        const previous = await read(actor.ownerId, input.id);
        if (input.revision && (!previous || previous.deletedAt)) throw notFound();
        if (previous && previous.kind !== payload.kind)
          throw new ApplicationError({
            code: "InvalidInput",
            message: "A record cannot change type.",
          });
        if (previous?.kind === "version")
          throw new ApplicationError({
            code: "Conflict",
            message: "Saved versions are immutable. Restore as a new draft revision.",
          });
        if (payload.kind === "version") {
          const draft = await read(actor.ownerId, payload.data.resumeId);
          if (
            draft?.payload.kind !== "resume" ||
            canonicalJson(draft.payload.data) !== canonicalJson(payload.data.snapshot)
          )
            throw new ApplicationError({
              code: "Conflict",
              message: "Save the draft before capturing this version. Its contents changed.",
            });
        }
        const now = Date.now(),
          revision = input.revision + 1,
          revisionId = newId();
        const guards = relationGuards(actor.ownerId, [payload]);
        guards.push(
          input.revision
            ? revisionGuard(actor.ownerId, input.id, input.revision)
            : conditionGuard(
                db,
                sql`NOT EXISTS(SELECT 1 FROM ${records} WHERE id=${input.id})`,
                "This identity already exists.",
              ),
        );
        const values = { revision, payload, name: recordName(payload), updatedAt: now };
        const writes: Write[] = [
          input.revision
            ? db
                .update(records)
                .set(values)
                .where(
                  and(
                    eq(records.ownerId, actor.ownerId),
                    eq(records.id, input.id),
                    eq(records.revision, input.revision),
                  ),
                )
            : db.insert(records).values({
                ...values,
                id: input.id,
                ownerId: actor.ownerId,
                kind: payload.kind,
                createdAt: now,
              }),
          db.insert(revisions).values({
            id: revisionId,
            recordId: input.id,
            revision,
            payload,
            actorId: actor.id,
            createdAt: now,
          }),
        ];
        return {
          result: { id: input.id, revision, revisionId },
          guards,
          writes,
          history: [{ entityId: input.id, before: previous?.payload, after: payload }],
        };
      });
    },
    async deleteWorkspaceRecord(actor: Principal, input: DeleteRecord) {
      return commands.commit(actor, "workspace.delete", input.idempotencyKey, input, async () => {
        const previous = await read(actor.ownerId, input.id);
        if (!previous || previous.deletedAt) throw notFound();
        requireWrite(actor, previous.kind);
        if (previous.kind === "version")
          throw new ApplicationError({
            code: "InvalidInput",
            message: "Saved versions are retained as immutable history.",
          });
        const now = Date.now();
        const guards = [revisionGuard(actor.ownerId, input.id, input.revision)];
        if (previous.kind === "context")
          guards.push(
            conditionGuard(
              db,
              sql`NOT EXISTS(SELECT 1 FROM ${records} WHERE owner_id=${actor.ownerId} AND kind='fact' AND deleted_at IS NULL AND json_extract(payload,'$.data.contextId')=${input.id})`,
              "Move or remove this context's facts first.",
            ),
          );
        return {
          result: { id: input.id, revision: input.revision + 1, revisionId: newId() },
          guards,
          writes: [
            db
              .update(records)
              .set({ deletedAt: now, updatedAt: now, revision: input.revision + 1 })
              .where(and(eq(records.id, input.id), eq(records.ownerId, actor.ownerId))),
          ],
          history: [{ entityId: input.id, before: previous.payload, after: { deletedAt: now } }],
        };
      });
    },
    async importWorkspaceFacts(actor: Principal, input: ImportFacts) {
      requireWrite(actor, "fact");
      return commands.commit(
        actor,
        "workspace.import-facts",
        input.idempotencyKey,
        input,
        async () => {
          const payloads: { id: string; payload: WorkspacePayload }[] = [
            ...input.contexts.map((data) => ({
              id: data.id,
              payload: { kind: "context" as const, data },
            })),
            ...input.facts.map((data) => ({
              id: data.id,
              payload: { kind: "fact" as const, data },
            })),
          ];
          if (new Set(payloads.map((item) => item.id)).size !== payloads.length)
            throw new ApplicationError({
              code: "InvalidInput",
              message: "Import identities must be unique.",
            });
          const guards = relationGuards(
              actor.ownerId,
              payloads.map((item) => item.payload),
              input.contexts.map((context) => context.id),
            ),
            writes: Write[] = [],
            now = Date.now();
          for (const { id, payload } of payloads) {
            writes.push(
              db.insert(records).values({
                id,
                ownerId: actor.ownerId,
                kind: payload.kind,
                name: recordName(payload),
                revision: 1,
                payload,
                createdAt: now,
                updatedAt: now,
              }),
            );
            writes.push(
              db.insert(revisions).values({
                id: newId(),
                recordId: id,
                revision: 1,
                payload,
                actorId: actor.id,
                createdAt: now,
              }),
            );
          }
          return {
            result: { id: payloads[0]?.id ?? newId(), revision: 1, revisionId: newId() },
            guards,
            writes,
            history: payloads.map(({ id, payload }) => ({ entityId: id, after: payload })),
          };
        },
      );
    },
  };
}

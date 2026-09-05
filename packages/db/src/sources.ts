import type { CreateSourceRequest, ExtractionResult, RetrySourceRequest } from "@river/contracts";
import { ApplicationError, canonicalJson, fingerprint, newId, type Principal } from "@river/domain";
import { and, desc, eq, sql } from "drizzle-orm";
import type { Database } from "./index";
import * as schema from "./schema";

export function createSourceRepository(db: Database) {
  const getSource = async (ownerId: string, id: string) =>
    (
      await db
        .select()
        .from(schema.sources)
        .where(and(eq(schema.sources.ownerId, ownerId), eq(schema.sources.id, id)))
        .limit(1)
    )[0];
  const receipt = async (actorId: string, command: string, key: string, digest: string) => {
    const saved = (
      await db
        .select()
        .from(schema.receipts)
        .where(
          and(
            eq(schema.receipts.actorId, actorId),
            eq(schema.receipts.command, command),
            eq(schema.receipts.key, key),
          ),
        )
        .limit(1)
    )[0];
    if (saved && saved.fingerprint !== digest)
      throw new ApplicationError({
        code: "Conflict",
        message: "This idempotency key was already used with different input.",
      });
    return saved?.resultId;
  };
  return {
    getSource,
    async listSources(ownerId: string) {
      return db
        .select()
        .from(schema.sources)
        .where(eq(schema.sources.ownerId, ownerId))
        .orderBy(desc(schema.sources.createdAt))
        .limit(200);
    },
    async uploadingSources() {
      return db
        .select()
        .from(schema.sources)
        .where(eq(schema.sources.state, "Uploading"))
        .limit(50);
    },
    async getProcessingResult(ownerId: string, sourceId: string, id: string) {
      return (
        await db
          .select({ result: schema.processingResults })
          .from(schema.processingResults)
          .innerJoin(schema.sources, eq(schema.sources.id, schema.processingResults.sourceId))
          .where(
            and(
              eq(schema.sources.ownerId, ownerId),
              eq(schema.sources.id, sourceId),
              eq(schema.processingResults.id, id),
            ),
          )
          .limit(1)
      )[0]?.result;
    },
    async sourceHistory(ownerId: string, sourceId: string) {
      return db
        .select({ result: schema.processingResults })
        .from(schema.processingResults)
        .innerJoin(schema.sources, eq(schema.sources.id, schema.processingResults.sourceId))
        .where(and(eq(schema.sources.ownerId, ownerId), eq(schema.sources.id, sourceId)))
        .orderBy(desc(schema.processingResults.createdAt));
    },
    async beginSource(
      actor: Principal,
      input: Omit<CreateSourceRequest, "contentBase64"> & { digest: string; byteLength: number },
    ) {
      const command = "create-source";
      const digest = await fingerprint(canonicalJson(input));
      const existing = await receipt(actor.id, command, input.idempotencyKey, digest);
      if (existing) return existing;
      const id = newId();
      const now = Date.now();
      const operationId = newId();
      const source = {
        id,
        ownerId: actor.ownerId,
        title: input.title,
        filename: input.filename,
        mime: input.mime,
        kind: input.kind,
        provenanceUrl: input.provenanceUrl,
        note: input.note,
        digest: input.digest,
        byteLength: input.byteLength,
        objectKey: `retained/sources/${actor.ownerId}/${id}/${input.digest}/original`,
        state: "Uploading" as const,
        operationId,
        createdAt: now,
        updatedAt: now,
      };
      try {
        await db.batch([
          db.insert(schema.sources).values(source),
          db.insert(schema.operations).values({
            id: operationId,
            ownerId: actor.ownerId,
            state: "Pending",
            stage: "Waiting for source upload",
            input: { sourceId: id, processingId: newId() },
            createdAt: now,
            updatedAt: now,
          }),
          db.insert(schema.dispatches).values({ operationId }),
          db.insert(schema.receipts).values({
            actorId: actor.id,
            command,
            key: input.idempotencyKey,
            fingerprint: digest,
            resultId: id,
            createdAt: now,
          }),
          db.insert(schema.audit).values({
            id: newId(),
            actorId: actor.id,
            command,
            entityId: id,
            after: source,
            createdAt: now,
          }),
        ]);
      } catch (error) {
        const replay = await receipt(actor.id, command, input.idempotencyKey, digest);
        if (replay) return replay;
        throw error;
      }
      return id;
    },
    async reserveUploadResume(actor: Principal, input: RetrySourceRequest) {
      const command = "resume-source-upload";
      const digest = await fingerprint(canonicalJson(input));
      const existing = await receipt(actor.id, command, input.idempotencyKey, digest);
      if (existing) return existing;
      const guardId = newId();
      const now = Date.now();
      try {
        await db.batch([
          db.insert(schema.mutationGuards).values({
            id: guardId,
            passed: sql`EXISTS (SELECT 1 FROM sources WHERE id = ${input.id} AND owner_id = ${actor.ownerId} AND revision = ${input.revision} AND state = 'Uploading')`,
          }),
          db
            .update(schema.sources)
            .set({ revision: input.revision + 1, updatedAt: now })
            .where(eq(schema.sources.id, input.id)),
          db.insert(schema.receipts).values({
            actorId: actor.id,
            command,
            key: input.idempotencyKey,
            fingerprint: digest,
            resultId: input.id,
            createdAt: now,
          }),
          db.insert(schema.audit).values({
            id: newId(),
            actorId: actor.id,
            command,
            entityId: input.id,
            before: { revision: input.revision },
            after: { revision: input.revision + 1 },
            createdAt: now,
          }),
          db.delete(schema.mutationGuards).where(eq(schema.mutationGuards.id, guardId)),
        ]);
      } catch (error) {
        const replay = await receipt(actor.id, command, input.idempotencyKey, digest);
        if (replay) return replay;
        const source = await getSource(actor.ownerId, input.id);
        if (!source) throw new ApplicationError({ code: "NotFound", message: "Source not found." });
        if (source.revision !== input.revision || source.state !== "Uploading")
          throw new ApplicationError({
            code: "Conflict",
            message: "This upload changed. Refresh the source before resuming.",
            expectedRevision: input.revision,
            observedRevision: source.revision,
          });
        throw error;
      }
      return input.id;
    },
    async finalizeSourceUpload(ownerId: string, id: string) {
      // Only the initial Uploading state can advance. A late upload cannot reset an extraction.
      await db
        .update(schema.sources)
        .set({ state: "Processing", updatedAt: Date.now() })
        .where(
          and(
            eq(schema.sources.ownerId, ownerId),
            eq(schema.sources.id, id),
            eq(schema.sources.state, "Uploading"),
          ),
        );
    },
    async retrySource(actor: Principal, input: RetrySourceRequest) {
      const command = "retry-source";
      const digest = await fingerprint(canonicalJson(input));
      const existing = await receipt(actor.id, command, input.idempotencyKey, digest);
      if (existing) return existing;
      const operationId = newId();
      const now = Date.now();
      const guardId = newId();
      try {
        await db.batch([
          db.insert(schema.mutationGuards).values({
            id: guardId,
            passed: sql`EXISTS (SELECT 1 FROM sources WHERE id = ${input.id} AND owner_id = ${actor.ownerId} AND revision = ${input.revision} AND state IN ('Ready', 'Failed'))`,
          }),
          db
            .update(schema.sources)
            .set({
              state: "Processing",
              operationId,
              failure: null,
              revision: input.revision + 1,
              updatedAt: now,
            })
            .where(eq(schema.sources.id, input.id)),
          db.insert(schema.operations).values({
            id: operationId,
            ownerId: actor.ownerId,
            state: "Pending",
            stage: "Waiting for text extraction",
            input: { sourceId: input.id, processingId: newId() },
            createdAt: now,
            updatedAt: now,
          }),
          db.insert(schema.dispatches).values({ operationId }),
          db.insert(schema.receipts).values({
            actorId: actor.id,
            command,
            key: input.idempotencyKey,
            fingerprint: digest,
            resultId: operationId,
            createdAt: now,
          }),
          db.insert(schema.audit).values({
            id: newId(),
            actorId: actor.id,
            command,
            entityId: input.id,
            before: { revision: input.revision },
            after: { revision: input.revision + 1, operationId },
            createdAt: now,
          }),
          db.delete(schema.mutationGuards).where(eq(schema.mutationGuards.id, guardId)),
        ]);
      } catch (error) {
        const replay = await receipt(actor.id, command, input.idempotencyKey, digest);
        if (replay) return replay;
        const source = await getSource(actor.ownerId, input.id);
        if (!source) throw new ApplicationError({ code: "NotFound", message: "Source not found." });
        if (source.revision !== input.revision || !["Ready", "Failed"].includes(source.state))
          throw new ApplicationError({
            code: "Conflict",
            message: "The source changed or is still processing. Refresh before retrying.",
            expectedRevision: input.revision,
            observedRevision: source.revision,
          });
        throw error;
      }
      return operationId;
    },
    async publishExtraction(input: {
      id: string;
      sourceId: string;
      operationId: string;
      objectKey: string;
      digest: string;
      extraction: ExtractionResult;
    }) {
      const { extraction, ...identity } = input;
      const guardId = newId();
      const now = Date.now();
      try {
        await db.batch([
          db.insert(schema.mutationGuards).values({
            id: guardId,
            passed: sql`EXISTS (SELECT 1 FROM sources JOIN operations ON sources.operation_id = operations.id WHERE sources.id = ${input.sourceId} AND operations.id = ${input.operationId} AND operations.state IN ('Pending', 'Running'))`,
          }),
          db
            .insert(schema.processingResults)
            .values({
              ...identity,
              parser: extraction.parser,
              parserVersion: extraction.parserVersion,
              characterCount: extraction.text.length,
              createdAt: now,
            })
            .onConflictDoNothing(),
          db
            .update(schema.sources)
            .set({ state: "Ready", currentProcessingId: input.id, failure: null, updatedAt: now })
            .where(eq(schema.sources.id, input.sourceId)),
          db
            .update(schema.operations)
            .set({ state: "Succeeded", stage: "Source text ready", failure: null, updatedAt: now })
            .where(eq(schema.operations.id, input.operationId)),
          db.delete(schema.mutationGuards).where(eq(schema.mutationGuards.id, guardId)),
        ]);
      } catch (error) {
        const operation = (
          await db
            .select()
            .from(schema.operations)
            .where(eq(schema.operations.id, input.operationId))
        )[0];
        if (operation && ["Succeeded", "Cancelled", "Failed"].includes(operation.state)) return;
        throw error;
      }
    },
    async failSource(operationId: string, message: string) {
      await db
        .update(schema.sources)
        .set({ state: "Failed", failure: message, updatedAt: Date.now() })
        .where(
          and(eq(schema.sources.operationId, operationId), eq(schema.sources.state, "Processing")),
        );
    },
  };
}

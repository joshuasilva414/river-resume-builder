import type { ArtifactManifest } from "@river/contracts";
import {
  ApplicationError,
  canonicalJson,
  fingerprint,
  newId,
  type ResumeDocument,
  type Theme,
} from "@river/domain";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { createAccessRepository } from "./access";
import { createBackupRepository } from "./backups";
import { createCheckpointRepository } from "./checkpoints";
import { createClarificationRepository } from "./clarifications";
import { createCompositionRepository } from "./composition";
import { createDuplicateAiRepository } from "./duplicate-ai";
import { createEvidenceRepository } from "./evidence";
import { createJobAiRepository } from "./job-ai";
import { createJobRepository } from "./jobs";
import { createLibraryRepository } from "./library";
import * as schema from "./schema";
import { createSourceAiRepository } from "./source-ai";
import { createSourceRepository } from "./sources";
import { createTemplateAiRepository } from "./template-ai";
import { createTemplateRepository } from "./templates";
import { createWordingRepository } from "./wording";

export { schema };
export const createDatabase = (binding: D1Database) => drizzle(binding, { schema });
export type Database = ReturnType<typeof createDatabase>;

export function createRepository(binding: D1Database) {
  const db = createDatabase(binding);
  const getOperation = async (id: string) =>
    (await db.select().from(schema.operations).where(eq(schema.operations.id, id)).limit(1))[0];
  const getReceipt = async (actorId: string, command: string, key: string) =>
    (
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

  return {
    ...createAccessRepository(db),
    ...createBackupRepository(db),
    ...createCheckpointRepository(db),
    ...createCompositionRepository(db),
    ...createClarificationRepository(db),
    ...createEvidenceRepository(db),
    ...createDuplicateAiRepository(db),
    ...createJobRepository(db),
    ...createJobAiRepository(db),
    ...createLibraryRepository(db),
    ...createSourceRepository(db),
    ...createSourceAiRepository(db),
    ...createWordingRepository(db),
    ...createTemplateRepository(db),
    ...createTemplateAiRepository(db),
    db,
    getOperation,
    async listOperations(ownerId: string) {
      return db
        .select()
        .from(schema.operations)
        .where(eq(schema.operations.ownerId, ownerId))
        .orderBy(desc(schema.operations.createdAt))
        .limit(50);
    },
    async startCompile(
      actorId: string,
      key: string,
      input: { document: ResumeDocument; theme: Theme },
    ) {
      const command = "compile-resume";
      const digest = await fingerprint(canonicalJson(input));
      const existing = await getReceipt(actorId, command, key);
      const replay = (receipt: NonNullable<typeof existing>) => {
        if (receipt.fingerprint !== digest)
          throw new ApplicationError({
            code: "Conflict",
            message: "This idempotency key was already used with different input.",
          });
        return receipt.resultId;
      };
      if (existing) return replay(existing);
      const id = newId();
      const now = Date.now();
      try {
        await db.batch([
          db.insert(schema.operations).values({
            id,
            ownerId: actorId,
            input,
            state: "Pending",
            stage: "Waiting for document runtime",
            createdAt: now,
            updatedAt: now,
          }),
          db.insert(schema.dispatches).values({ operationId: id }),
          db
            .insert(schema.receipts)
            .values({ actorId, command, key, fingerprint: digest, resultId: id, createdAt: now }),
          db.insert(schema.audit).values({
            id: newId(),
            actorId,
            command,
            entityId: id,
            after: { theme: input.theme },
            createdAt: now,
          }),
        ]);
      } catch (error) {
        const receipt = await getReceipt(actorId, command, key);
        if (receipt) return replay(receipt);
        throw error;
      }
      return id;
    },
    async pendingDispatches() {
      return db
        .select()
        .from(schema.dispatches)
        .where(
          and(
            isNull(schema.dispatches.dispatchedAt),
            sql`NOT EXISTS (SELECT 1 FROM sources WHERE sources.operation_id = ${schema.dispatches.operationId} AND sources.state = 'Uploading')`,
          ),
        )
        .limit(50);
    },
    async cancelOperation(actorId: string, id: string, key: string) {
      const command = "cancel-operation";
      const digest = await fingerprint(id);
      const replay = await getReceipt(actorId, command, key);
      if (replay) {
        if (replay.fingerprint !== digest)
          throw new ApplicationError({ code: "Conflict", message: "Idempotency input changed." });
        return id;
      }
      const guardId = newId();
      try {
        await db.batch([
          db.insert(schema.mutationGuards).values({
            id: guardId,
            passed: sql`EXISTS (SELECT 1 FROM operations WHERE id = ${id} AND owner_id = ${actorId} AND state IN ('Pending', 'Running'))`,
          }),
          db
            .update(schema.operations)
            .set({ state: "Cancelled", stage: "Cancelled by Owner", updatedAt: Date.now() })
            .where(eq(schema.operations.id, id)),
          db
            .update(schema.dispatches)
            .set({ dispatchedAt: null })
            .where(eq(schema.dispatches.operationId, id)),
          db.insert(schema.receipts).values({
            actorId,
            command,
            key,
            fingerprint: digest,
            resultId: id,
            createdAt: Date.now(),
          }),
          db.insert(schema.audit).values({
            id: newId(),
            actorId,
            command,
            entityId: id,
            after: { state: "Cancelled" },
            createdAt: Date.now(),
          }),
          db.delete(schema.mutationGuards).where(eq(schema.mutationGuards.id, guardId)),
        ]);
      } catch (error) {
        const receipt = await getReceipt(actorId, command, key);
        if (receipt?.fingerprint === digest) return id;
        const current = await getOperation(id);
        if (!current || current.ownerId !== actorId)
          throw new ApplicationError({ code: "NotFound", message: "Operation not found." });
        if (current.state !== "Pending" && current.state !== "Running")
          throw new ApplicationError({
            code: "Conflict",
            message: "This operation has already finished.",
          });
        throw error;
      }
      return id;
    },
    async activeOperations() {
      return db
        .select()
        .from(schema.operations)
        .where(eq(schema.operations.state, "Running"))
        .limit(50);
    },
    async markDispatched(operationId: string, expectedState: string) {
      await db
        .update(schema.dispatches)
        .set({ dispatchedAt: Date.now(), attempts: sql`${schema.dispatches.attempts} + 1` })
        .where(
          and(
            eq(schema.dispatches.operationId, operationId),
            sql`EXISTS (SELECT 1 FROM operations WHERE id = ${operationId} AND state = ${expectedState})`,
          ),
        );
    },
    async updateOperation(
      id: string,
      values: {
        state: "Running" | "Succeeded" | "Failed";
        stage: string;
        failure?: string | null;
        artifacts?: ArtifactManifest;
      },
    ) {
      await db
        .update(schema.operations)
        .set({ ...values, updatedAt: Date.now() })
        .where(
          and(
            eq(schema.operations.id, id),
            inArray(schema.operations.state, ["Pending", "Running"]),
          ),
        );
    },
    async saveDraft(input: {
      id: string;
      actorId: string;
      revision: number;
      document: ResumeDocument;
      theme: Theme;
      key: string;
      referenceIds: readonly string[];
    }) {
      const { id, actorId, revision, document, theme, key } = input;
      const command = "save-draft";
      const digest = await fingerprint(canonicalJson(input));
      const existing = await getReceipt(actorId, command, key);
      if (existing) {
        if (existing.fingerprint !== digest)
          throw new ApplicationError({ code: "Conflict", message: "Idempotency input changed." });
        return revision + 1;
      }
      const guardId = newId();
      try {
        await db.batch([
          db.insert(schema.mutationGuards).values({
            id: guardId,
            passed: sql`EXISTS (SELECT 1 FROM drafts WHERE id = ${id} AND owner_id = ${actorId} AND revision = ${revision})`,
          }),
          db
            .update(schema.drafts)
            .set({ document, theme, revision: revision + 1, updatedAt: Date.now() })
            .where(
              and(
                eq(schema.drafts.id, id),
                eq(schema.drafts.ownerId, actorId),
                eq(schema.drafts.revision, revision),
              ),
            ),
          db.delete(schema.references).where(eq(schema.references.draftId, id)),
          ...input.referenceIds.map((targetId) =>
            db.insert(schema.references).values({ draftId: id, targetId, revision: revision + 1 }),
          ),
          db.insert(schema.receipts).values({
            actorId,
            command,
            key,
            fingerprint: digest,
            resultId: id,
            createdAt: Date.now(),
          }),
          db.insert(schema.audit).values({
            id: newId(),
            actorId,
            command,
            entityId: id,
            before: { revision },
            after: { revision: revision + 1 },
            createdAt: Date.now(),
          }),
          db.delete(schema.mutationGuards).where(eq(schema.mutationGuards.id, guardId)),
        ]);
      } catch (error) {
        const receipt = await getReceipt(actorId, command, key);
        if (receipt?.fingerprint === digest) return revision + 1;
        const current = (
          await db
            .select({ revision: schema.drafts.revision })
            .from(schema.drafts)
            .where(and(eq(schema.drafts.id, id), eq(schema.drafts.ownerId, actorId)))
            .limit(1)
        )[0];
        if (!current) throw new ApplicationError({ code: "NotFound", message: "Draft not found." });
        if (current.revision !== revision)
          throw new ApplicationError({
            code: "Conflict",
            message: "This draft changed elsewhere.",
            expectedRevision: revision,
            observedRevision: current.revision,
          });
        throw error;
      }
      return revision + 1;
    },
  };
}
export type Repository = ReturnType<typeof createRepository>;

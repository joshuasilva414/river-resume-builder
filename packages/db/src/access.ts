import type { CreateCredentialRequest, RevokeCredentialRequest } from "@river/contracts";
import { ApplicationError, canonicalJson, fingerprint, newId } from "@river/domain";
import { and, desc, eq, sql } from "drizzle-orm";
import type { Database } from "./index";
import * as schema from "./schema";

export function createAccessRepository(db: Database) {
  const receipt = async (actorId: string, command: string, key: string) =>
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
  const getCredential = async (id: string) =>
    (await db.select().from(schema.credentials).where(eq(schema.credentials.id, id)).limit(1))[0];
  return {
    getCredential,
    async listCredentials(ownerId: string) {
      return db
        .select({
          id: schema.credentials.id,
          name: schema.credentials.name,
          scopes: schema.credentials.scopes,
          revision: schema.credentials.revision,
          createdAt: schema.credentials.createdAt,
          expiresAt: schema.credentials.expiresAt,
          revokedAt: schema.credentials.revokedAt,
          lastUsedAt: schema.credentials.lastUsedAt,
        })
        .from(schema.credentials)
        .where(eq(schema.credentials.ownerId, ownerId))
        .orderBy(desc(schema.credentials.createdAt));
    },
    async createCredential(actorId: string, input: CreateCredentialRequest) {
      const command = "create-credential";
      const digest = await fingerprint(canonicalJson(input));
      const replay = (saved: NonNullable<Awaited<ReturnType<typeof receipt>>>) => {
        if (saved.fingerprint !== digest)
          throw new ApplicationError({ code: "Conflict", message: "Idempotency input changed." });
        return saved.resultId;
      };
      const saved = await receipt(actorId, command, input.idempotencyKey);
      if (saved) return replay(saved);
      const now = Date.now();
      const metadata = {
        name: input.name.trim(),
        scopes: [...new Set(input.scopes)],
        expiresAt: input.expiresInDays === null ? null : now + input.expiresInDays * 86_400_000,
      };
      if (!metadata.name)
        throw new ApplicationError({ code: "InvalidInput", message: "Enter a credential name." });
      try {
        await db.batch([
          db.insert(schema.credentials).values({
            id: input.id,
            ownerId: actorId,
            secretHash: input.secretHash,
            ...metadata,
            createdAt: now,
          }),
          db.insert(schema.receipts).values({
            actorId,
            command,
            key: input.idempotencyKey,
            fingerprint: digest,
            resultId: input.id,
            createdAt: now,
          }),
          db.insert(schema.audit).values({
            id: newId(),
            actorId,
            command,
            entityId: input.id,
            after: metadata,
            createdAt: now,
          }),
        ]);
      } catch (error) {
        const saved = await receipt(actorId, command, input.idempotencyKey);
        if (saved) return replay(saved);
        throw error;
      }
      return input.id;
    },
    async revokeCredential(actorId: string, input: RevokeCredentialRequest) {
      const command = "revoke-credential";
      const digest = await fingerprint(canonicalJson(input));
      const saved = await receipt(actorId, command, input.idempotencyKey);
      if (saved) {
        if (saved.fingerprint !== digest)
          throw new ApplicationError({ code: "Conflict", message: "Idempotency input changed." });
        return input.id;
      }
      const guard = newId();
      try {
        await db.batch([
          db.insert(schema.mutationGuards).values({
            id: guard,
            passed: sql`EXISTS (SELECT 1 FROM agent_credentials WHERE id = ${input.id} AND owner_id = ${actorId} AND revision = ${input.revision} AND revoked_at IS NULL)`,
          }),
          db
            .update(schema.credentials)
            .set({ revokedAt: Date.now(), revision: input.revision + 1 })
            .where(eq(schema.credentials.id, input.id)),
          db.insert(schema.receipts).values({
            actorId,
            command,
            key: input.idempotencyKey,
            fingerprint: digest,
            resultId: input.id,
            createdAt: Date.now(),
          }),
          db.insert(schema.audit).values({
            id: newId(),
            actorId,
            command,
            entityId: input.id,
            before: { revision: input.revision, revokedAt: null },
            after: { revision: input.revision + 1, revoked: true },
            createdAt: Date.now(),
          }),
          db.delete(schema.mutationGuards).where(eq(schema.mutationGuards.id, guard)),
        ]);
      } catch (error) {
        const saved = await receipt(actorId, command, input.idempotencyKey);
        if (saved?.fingerprint === digest) return input.id;
        const current = await getCredential(input.id);
        if (!current || current.ownerId !== actorId)
          throw new ApplicationError({ code: "NotFound", message: "Credential not found." });
        if (current.revision !== input.revision || current.revokedAt !== null)
          throw new ApplicationError({
            code: "Conflict",
            message: "This credential changed. Refresh before revoking it.",
            expectedRevision: input.revision,
            observedRevision: current.revision,
          });
        throw error;
      }
      return input.id;
    },
    async credentialUsed(id: string) {
      await db
        .update(schema.credentials)
        .set({ lastUsedAt: Date.now() })
        .where(eq(schema.credentials.id, id));
    },
    async activity(ownerId: string) {
      return db
        .select()
        .from(schema.audit)
        .where(
          sql`${schema.audit.actorId} = ${ownerId} OR ${schema.audit.actorId} IN (SELECT id FROM agent_credentials WHERE owner_id = ${ownerId})`,
        )
        .orderBy(desc(schema.audit.createdAt))
        .limit(100);
    },
  };
}

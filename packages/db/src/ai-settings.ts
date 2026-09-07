import type {
  RemoveAiConnectionRequest,
  SaveAiConnectionRequest,
  SaveWorkspacePreferencesRequest,
} from "@river/contracts";
import type { AiExecutionMetadata } from "@river/domain";
import { ApplicationError, defaultWorkspacePreferences, type Principal } from "@river/domain";
import { and, eq, isNull, sql } from "drizzle-orm";
import { conditionGuard, createCommands } from "./commands";
import type { Database } from "./index";
import * as s from "./schema";

export function createAiSettingsRepository(db: Database) {
  const commands = createCommands(db);
  const requireOwner = (actor: Principal) => {
    if (actor.kind !== "owner")
      throw new ApplicationError({
        code: "Forbidden",
        message: "Only the account owner can manage AI connections.",
      });
  };
  const getAiConnection = async (ownerId: string, id: string) =>
    (
      await db
        .select()
        .from(s.aiConnections)
        .where(and(eq(s.aiConnections.id, id), eq(s.aiConnections.ownerId, ownerId)))
        .limit(1)
    )[0] ?? null;
  const getWorkspacePreferences = async (ownerId: string) => {
    const row = (
      await db
        .select()
        .from(s.workspacePreferences)
        .where(eq(s.workspacePreferences.ownerId, ownerId))
        .limit(1)
    )[0];
    return row
      ? { revision: row.revision, preferences: row.data }
      : { revision: 0, preferences: defaultWorkspacePreferences };
  };
  return {
    async recordAiExecution(ownerId: string, operationId: string, metadata: AiExecutionMetadata) {
      const operation = await db
        .select({ id: s.operations.id })
        .from(s.operations)
        .where(and(eq(s.operations.id, operationId), eq(s.operations.ownerId, ownerId)))
        .limit(1);
      if (!operation.length)
        throw new ApplicationError({ code: "NotFound", message: "AI execution not found." });
      await db
        .insert(s.aiExecutionMetadata)
        .values({ ownerId, operationId, data: metadata, createdAt: Date.now() })
        .onConflictDoNothing();
    },
    getAiConnection,
    getWorkspacePreferences,
    async getOnboardingProgress(ownerId: string) {
      const exists = (table: string) =>
        sql<number>`EXISTS (SELECT 1 FROM ${sql.identifier(table)} WHERE owner_id=${ownerId})`;
      const row = await db.get<{
        evidence: number;
        job: number;
        content: number;
        draft: number;
        review: number;
        exported: number;
      }>(
        sql`SELECT ${exists("evidence_claims")} AS evidence, ${exists("job_targets")} AS job, ${exists("library_items")} AS content, ${exists("resume_drafts")} AS draft, EXISTS (SELECT 1 FROM checkpoint_review_reports r JOIN resume_checkpoints c ON c.id=r.checkpoint_id WHERE c.owner_id=${ownerId}) AS review, EXISTS (SELECT 1 FROM checkpoint_exports e JOIN resume_checkpoints c ON c.id=e.checkpoint_id WHERE c.owner_id=${ownerId}) AS exported`,
      );
      return row ?? { evidence: 0, job: 0, content: 0, draft: 0, review: 0, exported: 0 };
    },
    async listAiConnections(ownerId: string) {
      return db
        .select({
          id: s.aiConnections.id,
          provider: s.aiConnections.provider,
          revision: s.aiConnections.revision,
          keySuffix: s.aiConnections.keySuffix,
          createdAt: s.aiConnections.createdAt,
          updatedAt: s.aiConnections.updatedAt,
        })
        .from(s.aiConnections)
        .where(and(eq(s.aiConnections.ownerId, ownerId), isNull(s.aiConnections.removedAt)));
    },
    async saveAiConnection(
      actor: Principal,
      input: Omit<SaveAiConnectionRequest, "apiKey">,
      secret: { encryptedKey: string; keySuffix: string; fingerprint: string },
    ) {
      requireOwner(actor);
      return commands.commit(
        actor,
        "save-ai-connection",
        input.idempotencyKey,
        { ...input, keyFingerprint: secret.fingerprint },
        async () => {
          const now = Date.now();
          const current = await getAiConnection(actor.ownerId, input.id);
          if (input.revision !== null && (!current || current.removedAt !== null))
            throw new ApplicationError({ code: "NotFound", message: "AI connection not found." });
          const revision = input.revision === null ? 0 : input.revision + 1;
          const guard =
            input.revision === null
              ? sql`NOT EXISTS (SELECT 1 FROM ai_connections WHERE id = ${input.id} OR (owner_id = ${actor.ownerId} AND provider = ${input.provider} AND removed_at IS NULL))`
              : sql`EXISTS (SELECT 1 FROM ai_connections WHERE id = ${input.id} AND owner_id = ${actor.ownerId} AND provider = ${input.provider} AND revision = ${input.revision} AND removed_at IS NULL)`;
          return {
            result: { revisionId: null, id: input.id, revision },
            guards: [
              conditionGuard(db, guard, "This provider connection changed. Refresh before saving."),
            ],
            writes:
              input.revision === null
                ? [
                    db.insert(s.aiConnections).values({
                      id: input.id,
                      ownerId: actor.ownerId,
                      provider: input.provider,
                      revision,
                      encryptedKey: secret.encryptedKey,
                      keySuffix: secret.keySuffix,
                      createdAt: now,
                      updatedAt: now,
                    }),
                  ]
                : [
                    db
                      .update(s.aiConnections)
                      .set({
                        revision,
                        encryptedKey: secret.encryptedKey,
                        keySuffix: secret.keySuffix,
                        updatedAt: now,
                      })
                      .where(eq(s.aiConnections.id, input.id)),
                  ],
            history: [
              {
                entityId: input.id,
                after: {
                  provider: input.provider,
                  revision,
                  action: input.revision === null ? "connected" : "key-replaced",
                },
              },
            ],
          };
        },
      );
    },
    async removeAiConnection(actor: Principal, input: RemoveAiConnectionRequest) {
      requireOwner(actor);
      return commands.commit(
        actor,
        "remove-ai-connection",
        input.idempotencyKey,
        input,
        async () => ({
          result: { revisionId: null, id: input.id, revision: input.revision + 1 },
          guards: [
            conditionGuard(
              db,
              sql`EXISTS (SELECT 1 FROM ai_connections WHERE id = ${input.id} AND owner_id = ${actor.ownerId} AND revision = ${input.revision} AND removed_at IS NULL)`,
              "This connection changed or was already removed. Refresh before continuing.",
            ),
          ],
          writes: [
            db
              .update(s.aiConnections)
              .set({
                encryptedKey: null,
                removedAt: Date.now(),
                updatedAt: Date.now(),
                revision: input.revision + 1,
              })
              .where(eq(s.aiConnections.id, input.id)),
            db
              .update(s.workspacePreferences)
              .set({
                data: sql`json_set(${s.workspacePreferences.data}, '$.defaultAi', NULL)`,
                revision: sql`${s.workspacePreferences.revision} + 1`,
              })
              .where(
                and(
                  eq(s.workspacePreferences.ownerId, actor.ownerId),
                  sql`json_extract(${s.workspacePreferences.data}, '$.defaultAi.connectionId') = ${input.id}`,
                ),
              ),
          ],
          history: [{ entityId: input.id, after: { removed: true, revision: input.revision + 1 } }],
        }),
      );
    },
    async saveWorkspacePreferences(actor: Principal, input: SaveWorkspacePreferencesRequest) {
      requireOwner(actor);
      return commands.commit(
        actor,
        "save-workspace-preferences",
        input.idempotencyKey,
        input,
        async () => {
          const selection = input.preferences.defaultAi;
          return {
            result: { revisionId: null, id: actor.ownerId, revision: input.revision + 1 },
            guards: [
              conditionGuard(
                db,
                sql`COALESCE((SELECT revision FROM workspace_preferences WHERE owner_id = ${actor.ownerId}), 0) = ${input.revision}`,
                "Settings changed in another tab. Refresh before saving.",
              ),
              ...(selection
                ? [
                    conditionGuard(
                      db,
                      sql`EXISTS (SELECT 1 FROM ai_connections WHERE id = ${selection.connectionId} AND owner_id = ${actor.ownerId} AND removed_at IS NULL)`,
                      "Choose an active AI connection belonging to this account.",
                    ),
                  ]
                : []),
            ],
            writes: [
              db
                .insert(s.workspacePreferences)
                .values({
                  ownerId: actor.ownerId,
                  revision: input.revision + 1,
                  data: input.preferences,
                })
                .onConflictDoUpdate({
                  target: s.workspacePreferences.ownerId,
                  set: { revision: input.revision + 1, data: input.preferences },
                }),
            ],
            history: [{ entityId: actor.ownerId, after: input.preferences }],
          };
        },
      );
    },
  };
}

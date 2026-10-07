import { ApplicationError, newId, type Principal } from "@river/domain";
import type { ExtractedSource } from "@river/domain/workspace";
import { sql } from "drizzle-orm";
import { conditionGuard, createCommands } from "./commands";
import type { Database } from "./index";
import * as schema from "./schema";
export type ExtractedSourceObjects = {
  original: { key: string; digest: string; size: number };
  text: { key: string; digest: string };
};
export function createWorkspaceSourceRepository(db: Database) {
  const commands = createCommands(db);
  return {
    async saveExtractedSource(
      actor: Principal,
      input: Omit<ExtractedSource, "originalBase64">,
      objects: ExtractedSourceObjects,
    ) {
      if (actor.kind === "agent" && !actor.scopes.includes("source:write"))
        throw new ApplicationError({
          code: "Forbidden",
          message: "Source write permission is required.",
        });
      return commands.commit(
        actor,
        "workspace.source",
        input.idempotencyKey,
        { input, objects },
        async () => {
          const now = Date.now(),
            operationId = newId(),
            processingId = newId();
          return {
            result: { id: input.id, revision: 0, revisionId: processingId },
            guards: [
              conditionGuard(
                db,
                sql`NOT EXISTS(SELECT 1 FROM sources WHERE id=${input.id})`,
                "This source identity already exists.",
              ),
            ],
            writes: [
              db.insert(schema.operations).values({
                id: operationId,
                ownerId: actor.ownerId,
                state: "Succeeded",
                stage: "Text supplied by client",
                input: { sourceId: input.id, processingId },
                createdAt: now,
                updatedAt: now,
              }),
              db.insert(schema.sources).values({
                id: input.id,
                ownerId: actor.ownerId,
                title: input.title,
                filename: input.filename,
                mime: input.mime,
                kind: input.mime === "text/plain" ? "pasted" : "document",
                provenanceUrl: input.provenanceUrl,
                note: input.note,
                digest: objects.original.digest,
                byteLength: objects.original.size,
                objectKey: objects.original.key,
                state: "Ready",
                revision: 0,
                operationId,
                currentProcessingId: processingId,
                createdAt: now,
                updatedAt: now,
              }),
              db.insert(schema.processingResults).values({
                id: processingId,
                sourceId: input.id,
                operationId,
                objectKey: objects.text.key,
                digest: objects.text.digest,
                parser: input.parser,
                parserVersion: input.parserVersion,
                characterCount: input.text.length,
                createdAt: now,
              }),
            ],
            history: [
              {
                entityId: input.id,
                after: {
                  title: input.title,
                  parser: input.parser,
                  textDigest: objects.text.digest,
                },
              },
            ],
          };
        },
      );
    },
  };
}

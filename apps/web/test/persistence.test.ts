import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import type { D1Migration } from "@cloudflare/vitest-pool-workers";
import { createRepository, schema } from "@river/db";
import { newId } from "@river/domain";
import { syntheticResume } from "@river/templates";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

declare global {
  namespace Cloudflare {
    interface Env {
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

async function fixture() {
  const repository = createRepository(env.DB);
  const actorId = newId();
  await repository.db.insert(schema.user).values({
    id: actorId,
    email: `${actorId}@example.test`,
    name: "Test Owner",
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return { repository, actorId };
}

describe("D1 atomic commands", () => {
  it("persists cancellation once and prevents late results from replacing it", async () => {
    const { repository, actorId } = await fixture();
    const id = await repository.startCompile(actorId, "compile-to-cancel", {
      document: syntheticResume,
      theme: "classic",
    });
    await repository.updateOperation(id, { state: "Running", stage: "Compiling PDF" });
    await repository.markDispatched(id, "Running");
    await repository.cancelOperation(actorId, id, "cancel-once");
    await repository.cancelOperation(actorId, id, "cancel-once");
    await repository.updateOperation(id, { state: "Succeeded", stage: "Late result" });
    await repository.markDispatched(id, "Running");
    expect(await repository.getOperation(id)).toMatchObject({
      state: "Cancelled",
      artifacts: null,
    });
    expect(await repository.pendingDispatches()).toEqual(
      expect.arrayContaining([expect.objectContaining({ operationId: id })]),
    );
    expect(
      await repository.db.select().from(schema.audit).where(eq(schema.audit.actorId, actorId)),
    ).toHaveLength(2);
  });

  it("deduplicates concurrent retries and records the Operation and dispatch together", async () => {
    const { repository, actorId } = await fixture();
    const input = { document: syntheticResume, theme: "classic" as const };
    const results = await Promise.all(
      Array.from({ length: 4 }, () => repository.startCompile(actorId, "compile-once", input)),
    );
    expect(new Set(results).size).toBe(1);
    expect(await repository.listOperations(actorId)).toHaveLength(1);
    expect(
      await repository.db
        .select()
        .from(schema.dispatches)
        .where(eq(schema.dispatches.operationId, results[0] ?? "")),
    ).toHaveLength(1);
    expect(
      await repository.db.select().from(schema.audit).where(eq(schema.audit.actorId, actorId)),
    ).toHaveLength(1);
    await expect(
      repository.startCompile(actorId, "compile-once", { ...input, theme: "technical" }),
    ).rejects.toMatchObject({ code: "Conflict" });
  });

  it("rejects every dependent write when the revision is stale", async () => {
    const { repository, actorId } = await fixture();
    const id = newId();
    await repository.db.insert(schema.drafts).values({
      id,
      ownerId: actorId,
      revision: 0,
      document: syntheticResume,
      theme: "classic",
      updatedAt: Date.now(),
    });
    const command = {
      id,
      actorId,
      revision: 0,
      document: { ...syntheticResume, name: "Saved version" },
      theme: "classic" as const,
      key: "first",
      referenceIds: ["evidence-a"],
    };
    expect(await repository.saveDraft(command)).toBe(1);
    await expect(
      repository.saveDraft({
        ...command,
        key: "stale",
        document: { ...syntheticResume, name: "Stale version" },
        referenceIds: ["evidence-b"],
      }),
    ).rejects.toMatchObject({ code: "Conflict", expectedRevision: 0, observedRevision: 1 });
    const draft = await repository.db.select().from(schema.drafts).where(eq(schema.drafts.id, id));
    expect(draft[0]?.document.name).toBe("Saved version");
    expect(
      await repository.db.select().from(schema.references).where(eq(schema.references.draftId, id)),
    ).toMatchObject([{ targetId: "evidence-a", revision: 1 }]);
    expect(
      await repository.db.select().from(schema.audit).where(eq(schema.audit.actorId, actorId)),
    ).toHaveLength(1);
    expect(
      await repository.db
        .select()
        .from(schema.receipts)
        .where(eq(schema.receipts.actorId, actorId)),
    ).toHaveLength(1);
    expect(await repository.saveDraft(command)).toBe(1);
  });

  it("rolls back an earlier write when a later statement fails", async () => {
    const { repository, actorId } = await fixture();
    const id = newId();
    await expect(
      repository.db.batch([
        repository.db.insert(schema.drafts).values({
          id,
          ownerId: actorId,
          revision: 0,
          document: syntheticResume,
          theme: "classic",
          updatedAt: Date.now(),
        }),
        repository.db.insert(schema.mutationGuards).values({ id: newId(), passed: 0 }),
      ]),
    ).rejects.toThrow();
    expect(
      await repository.db.select().from(schema.drafts).where(eq(schema.drafts.id, id)),
    ).toEqual([]);
  });
});

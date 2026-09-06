import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { createRepository, schema } from "@river/db";
import { fingerprint, newId } from "@river/domain";
import { eq } from "drizzle-orm";
import { Effect } from "effect";
import { beforeAll, expect, it } from "vitest";
import { authenticatePrincipal } from "../src/server/auth";
import { Actor, execute, startProof } from "../src/server/services";

beforeAll(() => applyD1Migrations(env.DB, env.TEST_MIGRATIONS));
it("stores only credential hashes, enforces scopes, and revokes without stale or duplicate writes", async () => {
  const repository = createRepository(env.DB);
  const ownerId = newId();
  await repository.db.insert(schema.user).values({
    id: ownerId,
    email: "owner@example.test",
    name: "Owner",
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const settings = {
    ...env,
    ENVIRONMENT: "development" as const,
    APP_URL: "http://localhost:3000",
    OWNER_EMAIL: "owner@example.test",
    AUTH_SECRET: "river-test-only-secret-at-least-thirty-two-characters",
    EMAIL_FROM: "River <test@example.test>",
  };
  const secret = "ab".repeat(32);
  const input = {
    id: newId(),
    idempotencyKey: "create-once",
    name: "Read-only agent",
    secretHash: await fingerprint(secret),
    scopes: ["evidence:read"] as const,
    expiresInDays: 30,
  };
  expect(await repository.createCredential(ownerId, input)).toBe(input.id);
  expect(await repository.createCredential(ownerId, input)).toBe(input.id);
  expect(await repository.listCredentials(ownerId)).toHaveLength(1);
  expect((await repository.listCredentials(ownerId))[0]).not.toHaveProperty("secretHash");
  expect(JSON.stringify(await repository.activity(ownerId))).not.toContain(secret);
  expect(JSON.stringify(await repository.activity(ownerId))).not.toContain(input.secretHash);
  const headers = new Headers({ authorization: `Bearer river_${input.id}.${secret}` });
  expect(await authenticatePrincipal(settings, headers)).toMatchObject({
    kind: "agent",
    id: input.id,
    scopes: ["evidence:read"],
  });
  const readIdentity = Effect.gen(function* () {
    return (yield* Actor).id;
  });
  expect(await execute(settings, headers, readIdentity, "evidence:read")).toMatchObject({
    ok: true,
    value: input.id,
  });
  expect(await execute(settings, headers, readIdentity, "evidence:write")).toMatchObject({
    ok: false,
    error: { code: "Forbidden" },
  });
  expect(
    await execute(
      settings,
      headers,
      startProof(settings.ENVIRONMENT, { idempotencyKey: "forbidden", theme: "classic" }),
    ),
  ).toMatchObject({ ok: false, error: { code: "Forbidden" } });
  expect(await repository.listOperations(ownerId)).toHaveLength(0);
  await expect(
    repository.revokeCredential(ownerId, { id: input.id, revision: 1, idempotencyKey: "stale" }),
  ).rejects.toMatchObject({ code: "Conflict" });
  expect((await repository.getCredential(input.id))?.revokedAt).toBeNull();
  const revoke = { id: input.id, revision: 0, idempotencyKey: "revoke-once" };
  await repository.revokeCredential(ownerId, revoke);
  await repository.revokeCredential(ownerId, revoke);
  expect(await authenticatePrincipal(settings, headers)).toBeNull();
  expect(await execute(settings, headers, readIdentity, "evidence:read")).toMatchObject({
    ok: false,
    error: { code: "Unauthorized" },
  });
  expect(await repository.activity(ownerId)).toHaveLength(2);
  const expiring = { ...input, id: newId(), idempotencyKey: "expired-credential" };
  await repository.createCredential(ownerId, expiring);
  await repository.db
    .update(schema.credentials)
    .set({ expiresAt: Date.now() - 1 })
    .where(eq(schema.credentials.id, expiring.id));
  expect(
    await authenticatePrincipal(
      settings,
      new Headers({ authorization: `Bearer river_${expiring.id}.${secret}` }),
    ),
  ).toBeNull();
});

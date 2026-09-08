import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { createRepository, schema } from "@river/db";
import { newId, type Principal } from "@river/domain";
import { syntheticResume } from "@river/templates";
import { eq } from "drizzle-orm";
import { beforeAll, expect, it } from "vitest";
import { compositionFixture } from "./fixtures/composition";

beforeAll(() => applyD1Migrations(env.DB, env.TEST_MIGRATIONS));
async function account(administrator = false) {
  const store = createRepository(env.DB),
    id = newId();
  await store.db.insert(schema.user).values({
    id,
    name: "Account fixture",
    email: `${id}@example.test`,
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const actor: Principal = { kind: "owner", id, ownerId: id, isAdmin: administrator };
  return { store, actor };
}
it("restricts administrative reads and writes to the authenticated administrator", async () => {
  const f = await account(),
    admin = await account(true);
  const agent: Principal = {
    kind: "agent",
    id: newId(),
    ownerId: admin.actor.id,
    scopes: ["evidence:read"],
  };
  for (const actor of [f.actor, agent]) {
    await expect(f.store.adminDashboard(actor, { query: "", offset: 0 })).rejects.toMatchObject({
      code: "Forbidden",
    });
    await expect(
      f.store.setScoringLimit(actor, {
        ownerId: null,
        dailyLimit: 100,
        revision: 0,
        idempotencyKey: "forbidden-limit",
      }),
    ).rejects.toMatchObject({ code: "Forbidden" });
    await expect(
      f.store.resetScoringAllowance(actor, {
        ownerId: f.actor.id,
        day: "2000-01-01",
        used: 0,
        idempotencyKey: "forbidden-reset",
      }),
    ).rejects.toMatchObject({ code: "Forbidden" });
  }
});
it("returns cross-account identity and counts without private document or job content", async () => {
  const admin = await account(true),
    f = await compositionFixture();
  const privateTitle = "PRIVATE CONTENT MUST NOT LEAVE OWNER";
  await f.repository.db
    .update(schema.jobs)
    .set({ details: { ...f.jobDetail.job.details, role: privateTitle } })
    .where(eq(schema.jobs.ownerId, f.actor.ownerId));
  await f.repository.beginSource(f.actor, {
    title: privateTitle,
    filename: "private-resume.txt",
    mime: "text/plain",
    kind: "pasted",
    provenanceUrl: null,
    note: privateTitle,
    digest: "ab".repeat(32),
    byteLength: 12,
    idempotencyKey: "private-source",
  });
  const dashboard = await admin.store.adminDashboard(admin.actor, { query: "", offset: 0 });
  const row = dashboard.accounts.find((value) => value.id === f.actor.id);
  expect(row).toMatchObject({ jobs: 1, imports: 1, used: 0, reserved: 0, dailyLimit: 25 });
  expect(dashboard.totals).toMatchObject({ users: 2, jobs: 1, imports: 1 });
  expect(JSON.stringify(dashboard)).not.toContain(privateTitle);
  expect(JSON.stringify(dashboard)).not.toContain("private-resume.txt");
  expect(Object.keys(row ?? {}).sort()).toEqual(
    [
      "active",
      "cancelled",
      "dailyLimit",
      "email",
      "evidence",
      "exports",
      "failed",
      "id",
      "imports",
      "jobs",
      "name",
      "override",
      "processing",
      "reserved",
      "revision",
      "scores",
      "succeeded",
      "templates",
      "used",
    ].sort(),
  );
  const filtered = await admin.store.adminDashboard(admin.actor, {
    query: `${admin.actor.id}@example.test`,
    offset: 0,
  });
  expect(filtered.accounts).toHaveLength(1);
  expect(filtered.totals).toEqual(dashboard.totals);
  await expect(
    admin.store.inspectJob(admin.actor.ownerId, { id: f.jobDetail.job.id }),
  ).rejects.toMatchObject({ code: "NotFound" });
});
it("configures default and individual limits with revision guards and isolated overrides", async () => {
  const admin = await account(true),
    f = await account(),
    other = await account();
  const request = { ownerId: null, dailyLimit: 10, revision: 0, idempotencyKey: "default-ten" };
  const saved = await admin.store.setScoringLimit(admin.actor, request);
  expect(await admin.store.setScoringLimit(admin.actor, request)).toEqual(saved);
  await expect(
    admin.store.setScoringLimit(admin.actor, {
      ...request,
      dailyLimit: 12,
      idempotencyKey: "stale",
    }),
  ).rejects.toMatchObject({ code: "Conflict" });
  await admin.store.setScoringLimit(admin.actor, {
    ownerId: f.actor.id,
    dailyLimit: 3,
    revision: 0,
    idempotencyKey: "account-three",
  });
  expect(await f.store.readScoringAllowance(f.actor)).toMatchObject({ limit: 3, remaining: 3 });
  expect(await other.store.readScoringAllowance(other.actor)).toMatchObject({
    limit: 10,
    remaining: 10,
  });
  expect(await admin.store.readScoringAllowance(admin.actor)).toMatchObject({
    exempt: true,
    remaining: null,
  });
  await admin.store.setScoringLimit(admin.actor, {
    ownerId: f.actor.id,
    dailyLimit: null,
    revision: 1,
    idempotencyKey: "default-again",
  });
  expect(await f.store.readScoringAllowance(f.actor)).toMatchObject({ limit: 10 });
});
it("resets one account exactly once, preserves pending reservations, and rejects stale observations", async () => {
  const admin = await account(true),
    f = await account(),
    other = await account();
  const { day } = await f.store.readScoringAllowance(f.actor);
  await f.store.db.insert(schema.scoringUsageDays).values([
    { ownerId: f.actor.id, day, used: 7 },
    { ownerId: other.actor.id, day, used: 8 },
  ]);
  const operationId = await f.store.startCompile(f.actor.id, "pending-fixture", {
    document: syntheticResume,
    theme: "classic",
  });
  await f.store.db.insert(schema.scoringReservations).values({
    id: "pending-result",
    ownerId: f.actor.id,
    operationId,
    state: "Reserved",
    createdAt: Date.now(),
  });
  const request = { ownerId: f.actor.id, day, used: 7, idempotencyKey: "reset-once" };
  const result = await admin.store.resetScoringAllowance(admin.actor, request);
  expect(await admin.store.resetScoringAllowance(admin.actor, request)).toEqual(result);
  expect(await f.store.readScoringAllowance(f.actor)).toMatchObject({
    used: 0,
    reserved: 1,
    remaining: 24,
  });
  expect(await other.store.readScoringAllowance(other.actor)).toMatchObject({
    used: 8,
    remaining: 17,
  });
  await expect(
    admin.store.resetScoringAllowance(admin.actor, { ...request, idempotencyKey: "stale-count" }),
  ).rejects.toMatchObject({ code: "Conflict" });
  await expect(
    admin.store.resetScoringAllowance(admin.actor, {
      ...request,
      day: "2000-01-01",
      used: 0,
      idempotencyKey: "stale-day",
    }),
  ).rejects.toMatchObject({ code: "Conflict" });
  await f.store.db
    .update(schema.scoringReservations)
    .set({ state: "Consumed" })
    .where(eq(schema.scoringReservations.id, "pending-result"));
  expect(await f.store.readScoringAllowance(f.actor)).toMatchObject({
    used: 1,
    reserved: 0,
    remaining: 24,
  });
  await admin.store.resetScoringAllowance(admin.actor, {
    ownerId: f.actor.id,
    day,
    used: 1,
    idempotencyKey: "new-reset",
  });
  expect(await f.store.readScoringAllowance(f.actor)).toMatchObject({ used: 0, remaining: 25 });
});

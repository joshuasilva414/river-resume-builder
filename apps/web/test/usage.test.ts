import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { createRepository, schema } from "@river/db";
import { newId, type Principal } from "@river/domain";
import { beforeAll, expect, it, vi } from "vitest";

beforeAll(() => applyD1Migrations(env.DB, env.TEST_MIGRATIONS));

async function account() {
  const store = createRepository(env.DB),
    id = newId();
  await store.db.insert(schema.user).values({
    id,
    name: "Usage fixture",
    email: `${id}@example.test`,
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const actor: Principal = { kind: "owner", id, ownerId: id };
  return { store, id, actor };
}

it("returns the reset window from the same database day as its successful count", async () => {
  const f = await account();
  const clock = await env.DB.prepare("SELECT strftime('%Y-%m-%d','now') AS day").first<{
    day: string;
  }>();
  if (!clock) throw Error("Expected database clock");
  await f.store.db
    .insert(schema.scoringUsageDays)
    .values({ ownerId: f.id, day: clock.day, used: 25 });
  // Model an application clock crossing midnight after the database read started.
  const now = vi
    .spyOn(Date, "now")
    .mockReturnValue(Date.parse(`${clock.day}T00:00:00.000Z`) + 86_400_000);
  try {
    const allowance = await f.store.readScoringAllowance(f.actor);
    expect(allowance).toMatchObject({ day: clock.day, used: 25, remaining: 0 });
    expect(allowance.resetsAt).toBe(
      new Date(Date.parse(`${clock.day}T00:00:00.000Z`) + 86_400_000).toISOString(),
    );
  } finally {
    now.mockRestore();
  }
});

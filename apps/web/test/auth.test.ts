import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { createDatabase, schema } from "@river/db";
import { eq } from "drizzle-orm";
import { beforeAll, expect, it } from "vitest";
import { authenticate, createAuth } from "../src/server/auth";
import { execute, startProof } from "../src/server/services";

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

const settings = {
  ...env,
  ENVIRONMENT: "development" as const,
  APP_URL: "http://localhost:3000",
  OWNER_EMAIL: "owner@example.test",
  AUTH_SECRET: "river-test-only-secret-at-least-thirty-two-characters",
  EMAIL_FROM: "River <test@example.test>",
};

it("requires the allowlisted verified Owner and honors session revocation", async () => {
  const deliveries: string[] = [];
  const auth = createAuth(settings, async (message) => {
    deliveries.push(message.text);
  });
  const headers = new Headers({ Origin: settings.APP_URL });
  // Better Auth returns a synthetic response to avoid disclosing account existence.
  await auth.api.signUpEmail({
    body: { email: "other@example.test", password: "a-test-password-123456", name: "Other" },
    headers,
  });
  expect(
    await createDatabase(env.DB)
      .select()
      .from(schema.user)
      .where(eq(schema.user.email, "other@example.test")),
  ).toEqual([]);
  expect(deliveries).toHaveLength(0);
  await auth.api.signUpEmail({
    body: { email: settings.OWNER_EMAIL, password: "a-test-password-123456", name: "Owner" },
    headers,
  });
  await expect(
    auth.api.signInEmail({
      body: { email: settings.OWNER_EMAIL, password: "a-test-password-123456" },
      headers,
    }),
  ).rejects.toMatchObject({ status: "FORBIDDEN" });
  expect(await authenticate(settings, headers)).toBeNull();
  const verificationUrl = deliveries[0]?.split("\n").at(-1);
  if (!verificationUrl) throw Error("Expected a verification email");
  const token = new URL(verificationUrl).searchParams.get("token");
  if (!token) throw Error("Expected a verification token");
  await auth.api.verifyEmail({ query: { token }, headers });
  const response = await auth.api.signInEmail({
    body: { email: settings.OWNER_EMAIL, password: "a-test-password-123456" },
    headers,
    asResponse: true,
  });
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  if (!cookie) throw Error("Expected a session cookie");
  headers.set("Cookie", cookie);
  expect((await authenticate(settings, headers))?.user.email).toBe(settings.OWNER_EMAIL);
  const result = await execute(
    settings,
    headers,
    startProof({ idempotencyKey: "authenticated-proof", theme: "classic" }),
  );
  expect(result.ok).toBe(true);
  await auth.api.signOut({ headers });
  expect(await authenticate(settings, headers)).toBeNull();
  expect(
    await execute(
      settings,
      headers,
      startProof({ idempotencyKey: "revoked-proof", theme: "classic" }),
    ),
  ).toMatchObject({ ok: false, error: { code: "Unauthorized" } });
});

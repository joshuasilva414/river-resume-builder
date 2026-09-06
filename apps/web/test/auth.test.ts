import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { createDatabase, schema } from "@river/db";
import { eq } from "drizzle-orm";
import { beforeAll, expect, it } from "vitest";
import { authenticate, createAuth } from "../src/server/auth";
import { execute, listOperations, startProof } from "../src/server/services";

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
    startProof(settings.ENVIRONMENT, { idempotencyKey: "authenticated-proof", theme: "classic" }),
  );
  expect(result.ok).toBe(true);
  const before = await execute(settings, headers, listOperations("staging"));
  expect(before).toMatchObject({ ok: true, value: [{ id: expect.any(String) }] });
  expect(
    await execute(
      settings,
      headers,
      startProof("production", { idempotencyKey: "production-proof", theme: "classic" }),
    ),
  ).toMatchObject({ ok: false, error: { code: "NotFound", status: 404 } });
  expect(await execute(settings, headers, listOperations("production"))).toMatchObject({
    ok: false,
    error: { code: "NotFound", status: 404 },
  });
  expect(await execute(settings, headers, listOperations("staging"))).toEqual(before);
  await auth.api.signOut({ headers });
  expect(await authenticate(settings, headers)).toBeNull();
  expect(
    await execute(
      settings,
      headers,
      startProof(settings.ENVIRONMENT, { idempotencyKey: "revoked-proof", theme: "classic" }),
    ),
  ).toMatchObject({ ok: false, error: { code: "Unauthorized" } });
});

it("delivers single-use recovery only to the Owner and revokes existing sessions after a reset", async () => {
  const recoverySettings = { ...settings, OWNER_EMAIL: "recovery-owner@example.test" };
  const deliveries: { to: string; subject: string; text: string }[] = [];
  const auth = createAuth(recoverySettings, async (message) => {
    deliveries.push(message);
  });
  const headers = new Headers({ Origin: recoverySettings.APP_URL });
  const oldPassword = "fixture-old-password-123456";
  const newPassword = "fixture-new-password-654321";
  await auth.api.signUpEmail({
    body: { email: recoverySettings.OWNER_EMAIL, password: oldPassword, name: "Recovery Owner" },
    headers,
  });
  const verificationUrl = deliveries[0]?.text.split("\n").at(-1);
  if (!verificationUrl) throw Error("Expected verification delivery");
  const verificationToken = new URL(verificationUrl).searchParams.get("token");
  if (!verificationToken) throw Error("Expected verification token");
  await auth.api.verifyEmail({ query: { token: verificationToken }, headers });

  const sessions: Headers[] = [];
  for (let index = 0; index < 2; index++) {
    const response = await auth.api.signInEmail({
      body: { email: recoverySettings.OWNER_EMAIL, password: oldPassword },
      headers,
      asResponse: true,
    });
    const cookie = response.headers.get("set-cookie")?.split(";")[0];
    if (!cookie) throw Error("Expected pre-reset session");
    const sessionHeaders = new Headers(headers);
    sessionHeaders.set("Cookie", cookie);
    expect(await authenticate(recoverySettings, sessionHeaders)).not.toBeNull();
    sessions.push(sessionHeaders);
  }

  const unknown = await auth.api.requestPasswordReset({
    body: { email: "unknown@example.test", redirectTo: "/reset-password" },
    headers,
  });
  expect(deliveries).toHaveLength(1);
  const requested = await auth.api.requestPasswordReset({
    body: { email: recoverySettings.OWNER_EMAIL, redirectTo: "/reset-password" },
    headers,
  });
  expect(requested).toEqual(unknown);
  expect(deliveries).toHaveLength(2);
  for (const sessionHeaders of sessions)
    expect(await authenticate(recoverySettings, sessionHeaders)).not.toBeNull();
  const resetMail = deliveries[1];
  expect(resetMail).toMatchObject({
    to: recoverySettings.OWNER_EMAIL,
    subject: "Reset your River password",
  });
  const resetLink = resetMail?.text.split("\n")[1];
  if (!resetLink) throw Error("Expected reset delivery");
  const resetUrl = new URL(resetLink);
  expect(resetUrl.origin).toBe(recoverySettings.APP_URL);
  expect(resetUrl.searchParams.get("callbackURL")).toBe("/reset-password");
  const token = resetUrl.pathname.split("/").at(-1);
  if (!token) throw Error("Expected reset token");
  const callback = await auth.handler(new Request(resetUrl));
  expect(callback.status).toBe(302);
  const destination = new URL(callback.headers.get("location") ?? "", recoverySettings.APP_URL);
  expect(destination.pathname).toBe("/reset-password");
  expect(destination.searchParams.get("token")).toBe(token);

  await expect(
    auth.api.resetPassword({ body: { token, newPassword: "too-short" }, headers }),
  ).rejects.toMatchObject({ status: "BAD_REQUEST" });
  await auth.api.resetPassword({ body: { token, newPassword }, headers });
  for (const sessionHeaders of sessions)
    expect(await authenticate(recoverySettings, sessionHeaders)).toBeNull();
  await expect(
    auth.api.signInEmail({
      body: { email: recoverySettings.OWNER_EMAIL, password: oldPassword },
      headers,
    }),
  ).rejects.toMatchObject({ status: "UNAUTHORIZED" });
  await expect(
    auth.api.resetPassword({ body: { token, newPassword: oldPassword }, headers }),
  ).rejects.toMatchObject({ status: "BAD_REQUEST" });
  const signedIn = await auth.api.signInEmail({
    body: { email: recoverySettings.OWNER_EMAIL, password: newPassword },
    headers,
  });
  expect(signedIn.user.email).toBe(recoverySettings.OWNER_EMAIL);

  await auth.api.requestPasswordReset({
    body: { email: recoverySettings.OWNER_EMAIL, redirectTo: "/reset-password" },
    headers,
  });
  const expiringLink = deliveries[2]?.text.split("\n")[1];
  if (!expiringLink) throw Error("Expected a second reset delivery");
  const expiredToken = new URL(expiringLink).pathname.split("/").at(-1);
  if (!expiredToken) throw Error("Expected a second reset token");
  await createDatabase(env.DB)
    .update(schema.verification)
    .set({ expiresAt: new Date(Date.now() - 1_000) })
    .where(eq(schema.verification.identifier, `reset-password:${expiredToken}`));
  await expect(
    auth.api.resetPassword({ body: { token: expiredToken, newPassword: oldPassword }, headers }),
  ).rejects.toMatchObject({ status: "BAD_REQUEST" });
});

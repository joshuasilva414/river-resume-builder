import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { createRepository, schema } from "@river/db";
import { fingerprint, newId } from "@river/domain";
import { Effect } from "effect";
import { beforeAll, expect, it } from "vitest";
import { authenticate, authenticatePrincipal, createAuth } from "../src/server/auth";
import { readBackupStatus, retryBackup } from "../src/server/backups";
import { handleMcp } from "../src/server/mcp";
import { secureRequest } from "../src/server/request-security";
import { execute } from "../src/server/services";

beforeAll(() => applyD1Migrations(env.DB, env.TEST_MIGRATIONS));

it("keeps two authenticated sessions uncached and rechecks authentication after logout", async () => {
  const { a, b, settings, auth, alice, bob } = await accounts();
  const sessionResponse = (headers: Headers) =>
    secureRequest(
      new Request(`${settings.APP_URL}/_serverFn/session`, { headers }),
      settings,
      async (request) =>
        Response.json({
          user: (await authenticate(settings, request.headers))?.user.email ?? null,
        }),
    );
  for (const [account, email] of [
    [a, alice],
    [b, bob],
  ] as const) {
    const response = await sessionResponse(account.headers);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ user: email });
    const page = await secureRequest(
      new Request(`${settings.APP_URL}/jobs`, { headers: account.headers }),
      settings,
      async (request) =>
        new Response((await authenticate(settings, request.headers))?.user.email, {
          headers: { "Content-Type": "text/html" },
        }),
    );
    expect(page.headers.get("cache-control")).toBe("private, no-store");
    expect(await page.text()).toBe(email);
  }
  await auth.api.signOut({ headers: a.headers });
  const loggedOut = await sessionResponse(a.headers);
  expect(await loggedOut.json()).toEqual({ user: null });
  expect(loggedOut.headers.get("cache-control")).toBe("private, no-store");
  expect(await (await sessionResponse(b.headers)).json()).toEqual({ user: bob });
});

async function accounts() {
  const suffix = newId();
  const alice = `alice-${suffix}@example.test`,
    bob = `bob-${suffix}@example.test`;
  const settings = {
    ...env,
    ENVIRONMENT: "development" as const,
    APP_URL: "http://localhost:3000",
    ADMIN_EMAIL: alice,
    ALLOWED_EMAILS: ` ${bob.toUpperCase()} `,
    AUTH_SECRET: "multi-user-fixture-secret-at-least-thirty-two-characters",
    EMAIL_FROM: "River <test@example.test>",
  };
  const deliveries: { to: string; text: string }[] = [];
  const auth = createAuth(settings, async (message) => {
    deliveries.push(message);
  });
  const password = "fictional-password-123456";
  async function signup(email: string, name: string) {
    const headers = new Headers({ Origin: settings.APP_URL });
    await auth.api.signUpEmail({ body: { email, name, password }, headers });
    const mail = deliveries.find((delivery) => delivery.to === email);
    const token = new URL(mail?.text.split("\n").at(-1) ?? "").searchParams.get("token");
    if (!token) throw Error("Expected this account's verification email");
    await expect(
      auth.api.signInEmail({ body: { email, password }, headers }),
    ).rejects.toMatchObject({ status: "FORBIDDEN" });
    await auth.api.verifyEmail({ query: { token }, headers });
    const response = await auth.api.signInEmail({
      body: { email, password },
      headers,
      asResponse: true,
    });
    const cookie = response.headers.get("set-cookie")?.split(";")[0];
    if (!cookie) throw Error("Expected a fixture session");
    headers.set("cookie", cookie);
    const principal = await authenticatePrincipal(settings, headers);
    if (principal?.kind !== "owner") throw Error("Expected an authenticated account");
    return { headers, principal };
  }
  const a = await signup(alice, "Alice Fixture");
  const b = await signup(bob, "Bob Fixture");
  return {
    a,
    b,
    settings,
    deliveries,
    auth,
    password,
    alice,
    bob,
    store: createRepository(env.DB),
  };
}

it("admits two verified accounts, isolates recovery and distinguishes the administrator", async () => {
  const { a, b, settings, deliveries, auth, password, bob } = await accounts();
  expect(a.principal.isAdmin).toBe(true);
  expect(b.principal.isAdmin).toBe(false);
  expect((await authenticate(settings, b.headers))?.user.name).toBe("Bob Fixture");
  expect(new Set(deliveries.map((mail) => mail.to)).size).toBe(2);
  expect(await execute(settings, b.headers, readBackupStatus(settings, {}))).toMatchObject({
    ok: false,
    error: { status: 403 },
  });
  expect(
    await execute(
      settings,
      b.headers,
      retryBackup(settings, { date: "2026-09-06", attempt: 1, idempotencyKey: "admin-only" }),
    ),
  ).toMatchObject({ ok: false, error: { status: 403 } });
  expect(await execute(settings, a.headers, readBackupStatus(settings, {}))).toMatchObject({
    ok: true,
  });
  await auth.api.requestPasswordReset({
    body: { email: bob, redirectTo: "/reset-password" },
    headers: b.headers,
  });
  const reset = deliveries.at(-1);
  expect(reset?.to).toBe(bob);
  const token = new URL(reset?.text.split("\n")[1] ?? "").pathname.split("/").at(-1);
  if (!token) throw Error("Expected recovery token");
  await auth.api.resetPassword({
    body: { token, newPassword: `${password}-new` },
    headers: b.headers,
  });
  expect(await authenticate(settings, b.headers)).toBeNull();
  expect(await authenticate(settings, a.headers)).not.toBeNull();
});

it("scopes MCP agents to their account and disables existing sessions and agents when admission is removed", async () => {
  const { a, b, settings, store, auth, password, bob } = await accounts();
  const credentials = [];
  for (const account of [a, b]) {
    const id = newId(),
      secret = "ab".repeat(32);
    await store.createCredential(account.principal.id, {
      id,
      name: "Private agent",
      scopes: ["facts:read", "facts:write"],
      secretHash: await fingerprint(secret),
      expiresInDays: 1,
      idempotencyKey: "same-agent-key",
    });
    credentials.push(new Headers({ authorization: `Bearer river_${id}.${secret}` }));
  }
  const [aliceAgent, bobAgent] = credentials;
  if (!aliceAgent || !bobAgent) throw Error("Expected both credentials");
  const factId = newId();
  const factInput = {
    id: factId,
    revision: 0,
    idempotencyKey: "alice-fact",
    payload: {
      kind: "fact" as const,
      data: {
        id: factId,
        key: "skill",
        label: "Secret fact",
        value: { kind: "skill" as const, value: "Alice only" },
        contextId: null,
        sourceId: null,
      },
    },
  };
  const saved = await store.saveWorkspaceRecord(a.principal, factInput);
  const call = async (headers: Headers, name: string, args: unknown, config = settings) => {
    const requestHeaders = new Headers(headers);
    requestHeaders.set("content-type", "application/json");
    requestHeaders.set("accept", "application/json, text/event-stream");
    const response = await handleMcp(
      new Request(`${config.APP_URL}/mcp`, {
        method: "POST",
        headers: requestHeaders,
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name, arguments: args },
        }),
      }),
      config,
    );
    return { status: response.status, text: await response.text() };
  };
  expect((await call(aliceAgent, "get_fact", { id: saved.id })).text).toContain("Alice only");
  const forbidden = await call(bobAgent, "get_fact", { id: saved.id });
  expect(forbidden.text).toContain("NotFound");
  expect(forbidden.text).not.toContain("Alice only");
  const edited = await call(bobAgent, "save_fact", {
    ...factInput,
    revision: 1,
    idempotencyKey: "foreign-write",
  });
  expect(edited.text).toContain("NotFound");
  expect((await store.getWorkspaceRecord(a.principal.id, saved.id)).revision).toBe(1);
  const removed = { ...settings, ALLOWED_EMAILS: "" };
  expect(await authenticate(removed, b.headers)).toBeNull();
  expect(await authenticatePrincipal(removed, bobAgent)).toBeNull();
  expect((await call(bobAgent, "get_fact", { id: saved.id }, removed)).status).toBe(401);
  expect(await authenticate(removed, a.headers)).not.toBeNull();
  expect(await authenticatePrincipal(removed, aliceAgent)).not.toBeNull();
  await expect(
    createAuth(removed).api.signInEmail({ body: { email: bob, password }, headers: b.headers }),
  ).rejects.toMatchObject({ status: "FORBIDDEN" });
  await auth.api.signOut({ headers: a.headers });
});

it("shares database-backed email throttles across fresh auth instances", async () => {
  const settings = {
    ...env,
    ENVIRONMENT: "development" as const,
    APP_URL: "http://localhost:3000",
    ADMIN_EMAIL: "throttle@example.test",
    AUTH_SECRET: "auth-throttle-fixture-secret-thirty-two-characters",
    EMAIL_FROM: "River <test@example.test>",
  };
  const request = () =>
    new Request(`${settings.APP_URL}/api/auth/request-password-reset`, {
      method: "POST",
      headers: {
        Origin: settings.APP_URL,
        "content-type": "application/json",
        "cf-connecting-ip": "192.0.2.45",
      },
      body: JSON.stringify({ email: "unknown@example.test", redirectTo: "/reset-password" }),
    });
  for (let attempt = 0; attempt < 5; attempt++)
    expect((await createAuth(settings).handler(request())).status).toBe(200);
  const response = await createAuth(settings).handler(request());
  expect(response.status).toBe(429);
  expect(Number(response.headers.get("x-retry-after"))).toBeGreaterThan(0);
  expect(await createRepository(env.DB).db.select().from(schema.rateLimit)).not.toHaveLength(0);
  // Failure reporting must not echo a supplied payload or a database query.
  expect(await execute(settings, new Headers(), Effect.succeed(null))).toMatchObject({
    ok: false,
    error: { status: 401 },
  });
});

it("delivers verification and recovery through the hosted email adapter for both admitted recipients", async () => {
  const sent: (EmailMessage | EmailMessageBuilder)[] = [];
  const settings = {
    ...env,
    ENVIRONMENT: "staging" as const,
    APP_URL: "https://river-fixture.example.test",
    ADMIN_EMAIL: "mail-admin@example.test",
    ALLOWED_EMAILS: "mail-member@example.test",
    AUTH_SECRET: "hosted-mail-fixture-secret-thirty-two-characters",
    EMAIL_FROM: "River <test@example.test>",
    EMAIL: {
      async send(message: EmailMessage | EmailMessageBuilder) {
        sent.push(message);
        return { messageId: "synthetic-delivery" };
      },
    },
  };
  const headers = new Headers({ Origin: settings.APP_URL });
  for (const email of [settings.ADMIN_EMAIL, settings.ALLOWED_EMAILS]) {
    await createAuth(settings).api.signUpEmail({
      body: { email, name: "Mail Fixture", password: "fictional-mail-password-123456" },
      headers,
    });
    await createAuth(settings).api.requestPasswordReset({
      body: { email, redirectTo: "/reset-password" },
      headers,
    });
  }
  expect(sent).toMatchObject([
    { to: settings.ADMIN_EMAIL, from: settings.EMAIL_FROM, subject: "Verify your River account" },
    { to: settings.ADMIN_EMAIL, from: settings.EMAIL_FROM, subject: "Reset your River password" },
    {
      to: settings.ALLOWED_EMAILS,
      from: settings.EMAIL_FROM,
      subject: "Verify your River account",
    },
    {
      to: settings.ALLOWED_EMAILS,
      from: settings.EMAIL_FROM,
      subject: "Reset your River password",
    },
  ]);
  const removed = { ...settings, ALLOWED_EMAILS: "" };
  await createAuth(removed).api.requestPasswordReset({
    body: { email: settings.ALLOWED_EMAILS, redirectTo: "/reset-password" },
    headers,
  });
  expect(sent).toHaveLength(4);
});

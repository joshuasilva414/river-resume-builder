import { applyD1Migrations, introspectWorkflowInstance } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { createRepository, schema } from "@river/db";
import { fingerprint, newId } from "@river/domain";
import { Effect } from "effect";
import { beforeAll, expect, it } from "vitest";
import { authenticate, authenticatePrincipal, createAuth } from "../src/server/auth";
import { readBackupStatus, retryBackup } from "../src/server/backups";
import { runEvidenceCommand, searchEvidence } from "../src/server/evidence";
import { handleMcp } from "../src/server/mcp";
import { secureRequest } from "../src/server/request-security";
import { execute, listOperations, startProof } from "../src/server/services";
import { createSource, inspectSource, sourceDownload } from "../src/server/sources";

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
  const { a, b, settings, deliveries, auth, password, bob, store } = await accounts();
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
  expect(
    await execute(
      settings,
      b.headers,
      startProof("staging", { idempotencyKey: "proof", theme: "classic" }),
    ),
  ).toMatchObject({ ok: false, error: { status: 403 } });
  expect(await execute(settings, b.headers, listOperations("staging"))).toMatchObject({
    ok: false,
    error: { status: 403 },
  });
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
  expect(await store.listOperations(b.principal.id)).toHaveLength(0);
});

it("keeps sources, downloads, evidence and identical command keys private between authenticated users", async () => {
  const { a, b, settings, store } = await accounts();
  const sourceInput = {
    idempotencyKey: "same-key",
    title: "Private original",
    filename: "notes.txt",
    mime: "text/plain" as const,
    kind: "pasted" as const,
    provenanceUrl: null,
    note: "",
    contentBase64: btoa("Alice private source"),
  };
  const first = await execute(
    settings,
    a.headers,
    createSource(settings, sourceInput),
    "source:write",
  );
  const second = await execute(
    settings,
    b.headers,
    createSource(settings, { ...sourceInput, contentBase64: btoa("Bob private source") }),
    "source:write",
  );
  if (!first.ok || !second.ok) throw Error("Both uploads must succeed");
  expect(first.value.id).not.toBe(second.value.id);
  const source = await store.getSource(a.principal.id, first.value.id);
  if (!source) throw Error("Expected source");
  expect(source.objectKey).toContain(a.principal.id);
  const download = await execute(
    settings,
    a.headers,
    sourceDownload(settings, source.id),
    "source:read",
  );
  if (!download.ok) throw Error("Expected own download");
  expect(await download.value.text()).toBe("Alice private source");
  expect(download.value.headers.get("cache-control")).toBe("private, no-store");
  expect(
    await execute(settings, b.headers, sourceDownload(settings, source.id), "source:read"),
  ).toMatchObject({ ok: false, error: { status: 404 } });
  expect(
    await execute(settings, b.headers, inspectSource(settings, source.id), "source:read"),
  ).toMatchObject({ ok: false, error: { status: 404 } });
  for (const [account, assertion] of [
    [a, "Alice private achievement"],
    [b, "Bob private achievement"],
  ] as const) {
    expect(
      await execute(
        settings,
        account.headers,
        runEvidenceCommand(settings, {
          type: "create",
          idempotencyKey: "same-key",
          metadata: { label: "Private claim", tags: [], notes: "" },
          material: { assertion, contexts: [], citations: [] },
        }),
        "evidence:write",
      ),
    ).toMatchObject({ ok: true });
  }
  const query = { query: "", status: "All" as const, archived: false, contextId: null, offset: 0 };
  const found = await execute(settings, b.headers, searchEvidence(query), "evidence:read");
  expect(JSON.stringify(found)).toContain("Bob private achievement");
  expect(JSON.stringify(found)).not.toContain("Alice private achievement");
  expect((await store.listSources(b.principal.id)).map((item) => item.id)).toEqual([
    second.value.id,
  ]);
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
      scopes: ["evidence:read", "evidence:write"],
      secretHash: await fingerprint(secret),
      expiresInDays: 1,
      idempotencyKey: "same-agent-key",
    });
    credentials.push(new Headers({ authorization: `Bearer river_${id}.${secret}` }));
  }
  const [aliceAgent, bobAgent] = credentials;
  if (!aliceAgent || !bobAgent) throw Error("Expected both credentials");
  const claim = await execute(
    settings,
    a.headers,
    runEvidenceCommand(settings, {
      type: "create",
      idempotencyKey: "alice-claim",
      metadata: { label: "Secret claim", tags: [], notes: "" },
      material: { assertion: "Alice only", contexts: [], citations: [] },
    }),
    "evidence:write",
  );
  if (!claim.ok) throw Error("Expected claim");
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
  expect((await call(aliceAgent, "get_evidence", { id: claim.value.id })).text).toContain(
    "Alice only",
  );
  const forbidden = await call(bobAgent, "get_evidence", { id: claim.value.id });
  expect(forbidden.text).toContain("NotFound");
  expect(forbidden.text).not.toContain("Alice only");
  const edited = await call(bobAgent, "evidence_command", {
    command: {
      type: "metadata",
      id: claim.value.id,
      revision: 0,
      idempotencyKey: "foreign-write",
      metadata: { label: "Hijacked", tags: [], notes: "" },
    },
  });
  expect(edited.text).toContain("NotFound");
  expect((await store.getClaim(a.principal.id, claim.value.id))?.revision).toBe(0);
  const removed = { ...settings, ALLOWED_EMAILS: "" };
  expect(await authenticate(removed, b.headers)).toBeNull();
  expect(await authenticatePrincipal(removed, bobAgent)).toBeNull();
  expect((await call(bobAgent, "get_evidence", { id: claim.value.id }, removed)).status).toBe(401);
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

it("runs simultaneous durable extraction workflows without mixing originals or processing results", async () => {
  const { a, b, settings, store } = await accounts();
  const sources = [];
  for (const [account, text] of [
    [a, "Alice confidential extraction"],
    [b, "Bob confidential extraction"],
  ] as const) {
    const result = await execute(
      settings,
      account.headers,
      createSource(settings, {
        idempotencyKey: "workflow-source",
        title: "Private workflow",
        filename: "private.txt",
        mime: "text/plain",
        kind: "pasted",
        provenanceUrl: null,
        note: "",
        contentBase64: btoa(text),
      }),
      "source:write",
    );
    if (!result.ok) throw Error("Expected original");
    const source = await store.getSource(account.principal.id, result.value.id);
    if (!source) throw Error("Expected saved source");
    sources.push({ source, account, text });
  }
  await Promise.all(
    sources.map(async ({ source, account, text }) => {
      await using workflow = await introspectWorkflowInstance(
        env.DOCUMENT_WORKFLOW,
        source.operationId,
      );
      await workflow.modify(async (m) => {
        await m.disableSleeps();
      });
      await env.DOCUMENT_WORKFLOW.create({
        id: source.operationId,
        params: { operationId: source.operationId },
      });
      await workflow.waitForStatus("complete");
      const detail = await execute(
        settings,
        account.headers,
        inspectSource(settings, source.id),
        "source:read",
      );
      expect(JSON.stringify(detail)).toContain(text);
      const other = account.principal.id === a.principal.id ? b : a;
      expect(
        await execute(settings, other.headers, inspectSource(settings, source.id), "source:read"),
      ).toMatchObject({ ok: false, error: { status: 404 } });
      expect((await store.getOperation(source.operationId))?.ownerId).toBe(account.principal.id);
      expect((await store.getSource(account.principal.id, source.id))?.state).toBe("Ready");
    }),
  );
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

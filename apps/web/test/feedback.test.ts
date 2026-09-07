import { env } from "cloudflare:workers";
import { FeedbackSearch, SubmitFeedbackRequest, UpdateFeedbackRequest } from "@river/contracts";
import { createRepository, schema } from "@river/db";
import { newId, type Principal } from "@river/domain";
import { Schema } from "effect";
import { expect, it } from "vitest";
import { createAuth } from "../src/server/auth";
import { readFeedback, submitFeedback, updateFeedback } from "../src/server/feedback";
import { execute } from "../src/server/services";

async function fixture() {
  const store = createRepository(env.DB);
  async function account(isAdmin = false) {
    const id = newId();
    const actor: Principal = { kind: "owner", id, ownerId: id, isAdmin };
    await store.db.insert(schema.user).values({
      id,
      email: `${id}@example.test`,
      name: "Feedback fixture",
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    return actor;
  }
  return { store, alice: await account(), bob: await account(), admin: await account(true) };
}
const search = { inbox: false, kind: null, status: null, offset: 0 } as const;
const report = {
  idempotencyKey: "submit-once",
  kind: "Bug report",
  title: "Preview issue",
  description: "Fictional reproduction steps",
} as const;

it("keeps reports private between accounts and reserves the inbox and updates for administrators", async () => {
  const { store, alice, bob, admin } = await fixture();
  const saved = await store.submitFeedback(alice, report);
  expect((await store.listFeedback(alice, search)).items.map((row) => row.id)).toEqual([saved.id]);
  expect((await store.listFeedback(bob, search)).items).toEqual([]);
  expect((await store.listFeedback(admin, search)).items).toEqual([]);
  expect(
    (await store.listFeedback(admin, { ...search, inbox: true })).items.map((row) => row.id),
  ).toEqual([saved.id]);
  await expect(store.listFeedback(bob, { ...search, inbox: true })).rejects.toMatchObject({
    code: "Forbidden",
  });
  const update = {
    id: saved.id,
    revision: 0,
    idempotencyKey: "review",
    status: "In review",
    response: "Investigating this report.",
  } as const;
  await expect(store.updateFeedback(alice, update)).rejects.toMatchObject({ code: "Forbidden" });
  await expect(store.updateFeedback(bob, update)).rejects.toMatchObject({ code: "Forbidden" });
  const changed = await store.updateFeedback(admin, update);
  expect(await store.updateFeedback(admin, update)).toEqual(changed);
  expect((await store.listFeedback(alice, search)).items[0]).toMatchObject({
    status: "In review",
    response: update.response,
    revision: 1,
  });
  await expect(store.updateFeedback({ ...admin, isAdmin: false }, update)).rejects.toMatchObject({
    code: "Forbidden",
  });
  const agent: Principal = { kind: "agent", id: newId(), ownerId: alice.ownerId, scopes: [] };
  await expect(store.listFeedback(agent, search)).rejects.toMatchObject({ code: "Forbidden" });
  await expect(store.submitFeedback(agent, report)).rejects.toMatchObject({ code: "Forbidden" });
  await expect(store.updateFeedback(agent, update)).rejects.toMatchObject({ code: "Forbidden" });
});

it("deduplicates concurrent retries, rejects key reuse, and keeps report text out of audit records", async () => {
  const { store, alice, bob } = await fixture();
  const [a, b] = await Promise.all([
    store.submitFeedback(alice, report),
    store.submitFeedback(alice, report),
  ]);
  expect(a).toEqual(b);
  expect((await store.listFeedback(alice, search)).items).toHaveLength(1);
  await expect(
    store.submitFeedback(alice, { ...report, title: "Different" }),
  ).rejects.toMatchObject({ code: "Conflict" });
  expect((await store.submitFeedback(bob, report)).id).not.toBe(a.id);
  const audit = await store.db.select().from(schema.audit);
  expect(audit).toHaveLength(2);
  expect(JSON.stringify(audit)).not.toContain(report.description);
  expect(JSON.stringify(audit)).not.toContain(report.title);
});

it("allows only one concurrent administrator revision to commit with its audit and receipt", async () => {
  const { store, alice, admin } = await fixture();
  const saved = await store.submitFeedback(alice, report);
  const update = {
    id: saved.id,
    revision: 0,
    idempotencyKey: "first",
    status: "Planned",
    response: "First response",
  } as const;
  const results = await Promise.allSettled([
    store.updateFeedback(admin, update),
    store.updateFeedback(admin, {
      ...update,
      idempotencyKey: "second",
      status: "Closed",
      response: "Second response",
    }),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(results.find((r) => r.status === "rejected")).toMatchObject({
    reason: { code: "Conflict" },
  });
  expect((await store.listFeedback(alice, search)).items[0]?.revision).toBe(1);
  expect(await store.db.select().from(schema.audit)).toHaveLength(2);
  expect(await store.db.select().from(schema.receipts)).toHaveLength(2);
  await expect(
    store.updateFeedback(admin, { ...update, id: newId(), idempotencyKey: "missing" }),
  ).rejects.toMatchObject({ code: "NotFound" });
});

it("paginates and filters feedback without returning other accounts' reports", async () => {
  const { store, alice, bob, admin } = await fixture();
  for (let i = 0; i < 22; i++) {
    await store.db.insert(schema.feedback).values({
      id: newId(),
      ownerId: alice.ownerId,
      kind: "Feature request",
      title: `Request ${i}`,
      description: "Fixture",
      createdAt: i,
      updatedAt: i,
    });
  }
  await store.submitFeedback(bob, report);
  const first = await store.listFeedback(alice, search),
    second = await store.listFeedback(alice, { ...search, offset: 20 });
  expect(first.items).toHaveLength(20);
  expect(first.hasMore).toBe(true);
  expect(second.items).toHaveLength(2);
  expect(second.hasMore).toBe(false);
  expect(new Set([...first.items, ...second.items].map((row) => row.id)).size).toBe(22);
  expect((await store.listFeedback(alice, { ...search, kind: "Bug report" })).items).toEqual([]);
  expect(
    (await store.listFeedback(admin, { ...search, inbox: true, kind: "Bug report" })).items,
  ).toHaveLength(1);
  expect(
    (await store.listFeedback(admin, { ...search, inbox: true, status: "Resolved" })).items,
  ).toEqual([]);
});

it("rejects malformed and blank input and requires authentication on server actions", async () => {
  const { store, alice } = await fixture();
  expect(() =>
    Schema.decodeUnknownSync(SubmitFeedbackRequest)({ ...report, title: "x".repeat(161) }),
  ).toThrow();
  expect(() =>
    Schema.decodeUnknownSync(SubmitFeedbackRequest)({ ...report, description: "x".repeat(12001) }),
  ).toThrow();
  expect(() => Schema.decodeUnknownSync(FeedbackSearch)({ ...search, offset: -1 })).toThrow();
  expect(() =>
    Schema.decodeUnknownSync(UpdateFeedbackRequest)({
      id: newId(),
      revision: 0,
      idempotencyKey: "update",
      status: "Invalid",
      response: "",
    }),
  ).toThrow();
  await expect(
    store.submitFeedback(alice, { ...report, description: " \n " }),
  ).rejects.toMatchObject({ code: "InvalidInput" });
  const settings = {
    ...env,
    ENVIRONMENT: "development" as const,
    APP_URL: "http://localhost:3000",
    ADMIN_EMAIL: "admin@example.test",
    AUTH_SECRET: "feedback-fixture-secret-at-least-thirty-two-characters",
    EMAIL_FROM: "River <test@example.test>",
  };
  expect(await execute(settings, new Headers(), readFeedback(search))).toMatchObject({
    ok: false,
    error: { code: "Unauthorized" },
  });
  expect(await execute(settings, new Headers(), submitFeedback(report))).toMatchObject({
    ok: false,
    error: { code: "Unauthorized" },
  });
});

it("supports admitted account sessions without GitHub access and authorizes the administrator on the server", async () => {
  const settings = {
    ...env,
    ENVIRONMENT: "development" as const,
    APP_URL: "http://localhost:3000",
    ADMIN_EMAIL: "admin@example.test",
    ALLOWED_EMAILS: "reporter@example.test",
    AUTH_SECRET: "feedback-fixture-secret-at-least-thirty-two-characters",
    EMAIL_FROM: "River <test@example.test>",
  };
  const deliveries: { to: string; text: string }[] = [];
  const auth = createAuth(settings, async (message) => {
    deliveries.push(message);
  });
  async function signIn(email: string) {
    const password = "fictional-feedback-test-password";
    const headers = new Headers({ Origin: settings.APP_URL });
    await auth.api.signUpEmail({ body: { email, name: "Feedback test", password }, headers });
    const message = deliveries.find((mail) => mail.to === email);
    const token = new URL(message?.text.split("\n").at(-1) ?? "").searchParams.get("token");
    if (!token) throw Error("Missing fixture verification token");
    await auth.api.verifyEmail({ query: { token }, headers });
    const response = await auth.api.signInEmail({
      body: { email, password },
      headers,
      asResponse: true,
    });
    const cookie = response.headers.get("set-cookie")?.split(";")[0];
    if (!cookie) throw Error("Missing fixture session");
    headers.set("cookie", cookie);
    return headers;
  }
  const reporter = await signIn("reporter@example.test"),
    admin = await signIn("admin@example.test");
  const saved = await execute(settings, reporter, submitFeedback(report));
  if (!saved.ok) throw Error(saved.error.title);
  expect(await execute(settings, reporter, readFeedback(search))).toMatchObject({
    ok: true,
    value: { items: [{ id: saved.value.id }] },
  });
  expect(await execute(settings, reporter, readFeedback({ ...search, inbox: true }))).toMatchObject(
    { ok: false, error: { code: "Forbidden" } },
  );
  expect(await execute(settings, admin, readFeedback({ ...search, inbox: true }))).toMatchObject({
    ok: true,
    value: { items: [{ id: saved.value.id }] },
  });
  const update = {
    id: saved.value.id,
    revision: 0,
    idempotencyKey: "resolve",
    status: "Resolved",
    response: "Fixed in the test fixture.",
  } as const;
  expect(await execute(settings, reporter, updateFeedback(update))).toMatchObject({
    ok: false,
    error: { code: "Forbidden" },
  });
  expect(await execute(settings, admin, updateFeedback(update))).toMatchObject({
    ok: true,
    value: { revision: 1 },
  });
  expect(await execute(settings, reporter, readFeedback(search))).toMatchObject({
    ok: true,
    value: { items: [{ status: "Resolved", response: update.response }] },
  });
});

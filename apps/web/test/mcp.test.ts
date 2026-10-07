import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { createRepository, schema } from "@river/db";
import { type AgentScope, fingerprint, newId } from "@river/domain";
import { eq } from "drizzle-orm";
import { Schema } from "effect";
import { beforeAll, expect, it } from "vitest";
import { handleMcp } from "../src/server/mcp";

beforeAll(() => applyD1Migrations(env.DB, env.TEST_MIGRATIONS));
async function fixture(scopes: readonly AgentScope[]) {
  const repository = createRepository(env.DB);
  const ownerId = newId();
  const email = `${ownerId}@example.test`;
  await repository.db.insert(schema.user).values({
    id: ownerId,
    email,
    name: "MCP fixture",
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const secret = "cd".repeat(32);
  const credentialId = newId();
  await repository.createCredential(ownerId, {
    id: credentialId,
    name: "MCP test",
    scopes,
    secretHash: await fingerprint(secret),
    expiresInDays: 1,
    idempotencyKey: "credential",
  });
  const settings = {
    ...env,
    ENVIRONMENT: "development" as const,
    APP_URL: "http://localhost:3000",
    ADMIN_EMAIL: email,
    AUTH_SECRET: "mcp-test-only-at-least-thirty-two-characters",
    EMAIL_FROM: "River <test@example.test>",
  };
  const authorization = `Bearer river_${credentialId}.${secret}`;
  const call = async (method: string, params: unknown = {}) => {
    const response = await handleMcp(
      new Request(`${settings.APP_URL}/mcp`, {
        method: "POST",
        headers: {
          authorization,
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          "mcp-protocol-version": "2025-03-26",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      }),
      settings,
    );
    const text = await response.text();
    const data =
      text.startsWith("event:") || text.startsWith("data:")
        ? text
            .split("\n")
            .find((line) => line.startsWith("data: "))
            ?.slice(6)
        : text;
    return { status: response.status, json: JSON.parse(data ?? "null") as unknown };
  };
  return { repository, ownerId, credentialId, settings, call };
}
const ToolsResponse = Schema.Struct({
  result: Schema.Struct({
    tools: Schema.Array(Schema.Struct({ name: Schema.String, inputSchema: Schema.Unknown })),
  }),
});
const CallResponse = Schema.Struct({
  result: Schema.Struct({
    isError: Schema.Boolean,
    content: Schema.Array(Schema.Struct({ type: Schema.String, text: Schema.String })),
  }),
});
it("authenticates MCP and exposes only scoped fact tools", async () => {
  const { call, settings } = await fixture(["facts:read"]);
  expect((await handleMcp(new Request(`${settings.APP_URL}/mcp`), settings)).status).toBe(401);
  const tools = Schema.decodeUnknownSync(ToolsResponse)(
    (await call("tools/list")).json,
  ).result.tools.map((t) => t.name);
  expect(tools).toEqual(["list_fact_contexts", "get_fact_context", "list_facts", "get_fact"]);
  const retired = await call("tools/call", { name: "evidence_command", arguments: {} });
  expect(JSON.stringify(retired.json)).toContain("RIVER_WORKSPACE_REPLACED");
});
it("shares typed write receipts, validates payloads and revokes immediately", async () => {
  const { call, repository, ownerId, credentialId } = await fixture(["facts:read", "facts:write"]),
    id = newId();
  const input = {
    id,
    revision: 0,
    idempotencyKey: "once",
    payload: {
      kind: "fact",
      data: {
        id,
        key: "skill",
        label: "Skill",
        contextId: null,
        sourceId: null,
        value: { kind: "skill", value: "TypeScript" },
      },
    },
  };
  const first = await call("tools/call", { name: "save_fact", arguments: input });
  expect(Schema.decodeUnknownSync(CallResponse)(first.json).result.isError).toBe(false);
  expect((await call("tools/call", { name: "save_fact", arguments: input })).json).toEqual(
    first.json,
  );
  expect(await repository.listWorkspaceRecords(ownerId, "fact")).toHaveLength(1);
  const invalid = await call("tools/call", {
    name: "save_fact",
    arguments: { ...input, revision: "invalid" },
  });
  expect(JSON.stringify(invalid.json)).toMatch(/validation|invalid/i);
  await repository.revokeCredential(ownerId, {
    id: credentialId,
    revision: 0,
    idempotencyKey: "revoke",
  });
  expect((await call("tools/list")).status).toBe(401);
});
it("shares immutable job descriptions and rejects foreign fact selection", async () => {
  const { call, repository, ownerId } = await fixture(["jobs:read", "jobs:write"]);
  const input = {
    id: newId(),
    revision: 0,
    idempotencyKey: "job-once",
    details: { role: "Synthetic role", company: "Fixture", location: "" },
    description: "Synthetic posting. Not a real opening.",
    url: null,
    factIds: [],
    archived: false,
  };
  const first = await call("tools/call", { name: "save_job", arguments: input });
  expect(Schema.decodeUnknownSync(CallResponse)(first.json).result.isError).toBe(false);
  expect((await call("tools/call", { name: "save_job", arguments: input })).json).toEqual(
    first.json,
  );
  expect(await repository.listWorkspaceJobs(ownerId)).toHaveLength(1);
  const bad = await call("tools/call", {
    name: "save_job",
    arguments: { ...input, revision: 1, idempotencyKey: "foreign-fact", factIds: [newId()] },
  });
  expect(Schema.decodeUnknownSync(CallResponse)(bad.json).result.isError).toBe(true);
  expect((await repository.getWorkspaceJob(ownerId, input.id)).revision).toBe(1);
});
it("keeps retired credentials readable without advertising obsolete tools", async () => {
  const { repository, call, credentialId } = await fixture(["facts:read"]);
  await repository.db
    .update(schema.credentials)
    .set({ scopes: ["evidence:read", "evidence:verify"] })
    .where(eq(schema.credentials.id, credentialId));
  expect(
    Schema.decodeUnknownSync(ToolsResponse)((await call("tools/list")).json).result.tools,
  ).toEqual([]);
  expect(
    JSON.stringify((await call("tools/call", { name: "evidence_command", arguments: {} })).json),
  ).toContain("RIVER_WORKSPACE_REPLACED");
});

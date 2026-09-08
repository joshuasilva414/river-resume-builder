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
it("authenticates MCP, exposes only permitted tools, and rejects unknown mutation surfaces", async () => {
  const { call, settings } = await fixture(["evidence:read"]);
  expect((await handleMcp(new Request(`${settings.APP_URL}/mcp`), settings)).status).toBe(401);
  const listing = await call("tools/list");
  expect(listing.status).toBe(200);
  const tools = Schema.decodeUnknownSync(ToolsResponse)(listing.json).result.tools;
  expect(tools.map((tool) => tool.name)).toEqual([
    "search_evidence",
    "get_evidence",
    "list_contexts",
    "list_duplicates",
  ]);
  expect(tools[0]?.inputSchema).toMatchObject({
    type: "object",
    properties: { query: { type: "string" } },
  });
  const forbidden = await call("tools/call", {
    name: "evidence_command",
    arguments: { command: { type: "create" } },
  });
  expect(JSON.stringify(forbidden.json)).toMatch(/not found|Unknown tool/i);
});
it("shares command idempotency, validates arguments, checks subcommand scopes, and revokes immediately", async () => {
  const { call, repository, ownerId, credentialId } = await fixture([
    "evidence:read",
    "evidence:write",
  ]);
  const command = {
    type: "create",
    idempotencyKey: "once",
    metadata: { label: "Fixture", tags: [], notes: "" },
    material: { assertion: "Synthetic MCP claim", citations: [], contexts: [] },
  };
  const first = await call("tools/call", { name: "evidence_command", arguments: { command } });
  const repeated = await call("tools/call", { name: "evidence_command", arguments: { command } });
  expect(first.json).toEqual(repeated.json);
  expect(Schema.decodeUnknownSync(CallResponse)(first.json).result.isError).toBe(false);
  const claims = await repository.searchEvidence(ownerId, {
    query: "",
    status: "All",
    archived: false,
    contextId: null,
    offset: 0,
  });
  expect(claims.items).toHaveLength(1);
  const claim = claims.items[0];
  if (!claim) throw Error("Missing created claim");
  const forbidden = await call("tools/call", {
    name: "evidence_command",
    arguments: {
      command: {
        type: "archive",
        id: claim.id,
        revision: 0,
        archived: true,
        rationale: "Fixture",
        idempotencyKey: "forbidden",
      },
    },
  });
  expect(Schema.decodeUnknownSync(CallResponse)(forbidden.json).result).toMatchObject({
    isError: true,
  });
  expect(JSON.stringify(forbidden.json)).toContain("Forbidden");
  const invalid = await call("tools/call", {
    name: "evidence_command",
    arguments: {
      command: {
        ...command,
        idempotencyKey: "invalid",
        material: { ...command.material, assertion: "" },
      },
    },
  });
  expect(JSON.stringify(invalid.json)).toMatch(/validation|invalid/i);
  expect((await repository.getClaim(ownerId, claim.id))?.revision).toBe(0);
  await repository.revokeCredential(ownerId, {
    id: credentialId,
    revision: 0,
    idempotencyKey: "revoke",
  });
  expect((await call("tools/list")).status).toBe(401);
});

it("exposes scoped job tools and shares immutable posting command outcomes", async () => {
  const { call, repository, ownerId } = await fixture(["jobs:read", "jobs:write"]);
  const listing = Schema.decodeUnknownSync(ToolsResponse)((await call("tools/list")).json);
  expect(listing.result.tools.map((tool) => tool.name)).toEqual([
    "list_jobs",
    "get_job",
    "job_command",
  ]);
  const command = {
    type: "create",
    idempotencyKey: "job-once",
    details: { role: "Synthetic role", company: "Fixture", location: "" },
    posting: { text: "Synthetic posting. Not a real opening.", url: null },
  };
  const first = await call("tools/call", { name: "job_command", arguments: { command } });
  expect(Schema.decodeUnknownSync(CallResponse)(first.json).result.isError).toBe(false);
  expect((await call("tools/call", { name: "job_command", arguments: { command } })).json).toEqual(
    first.json,
  );
  expect(
    (await repository.listJobs(ownerId, { query: "", archived: false, offset: 0 })).items,
  ).toHaveLength(1);
  const readOnly = await fixture(["jobs:read"]);
  expect(
    Schema.decodeUnknownSync(ToolsResponse)(
      (await readOnly.call("tools/list")).json,
    ).result.tools.map((tool) => tool.name),
  ).toEqual(["list_jobs", "get_job"]);
});

it("keeps legacy credentials readable but omits verification and explains retired calls", async () => {
  const { repository, call, credentialId } = await fixture(["evidence:write"]);
  await repository.db
    .update(schema.credentials)
    .set({ scopes: ["evidence:write", "evidence:verify"] })
    .where(eq(schema.credentials.id, credentialId));
  const listing = Schema.decodeUnknownSync(ToolsResponse)((await call("tools/list")).json);
  const command = listing.result.tools.find((tool) => tool.name === "evidence_command");
  expect(command).toBeDefined();
  expect(JSON.stringify(command?.inputSchema)).not.toContain('"review"');
  const retired = Schema.decodeUnknownSync(CallResponse)(
    (
      await call("tools/call", {
        name: "evidence_command",
        arguments: { command: { type: "review" } },
      })
    ).json,
  );
  expect(retired.result.isError).toBe(true);
  expect(retired.result.content[0]?.text).toContain("retired in River v1.2");
});

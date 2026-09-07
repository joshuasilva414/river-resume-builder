import { env } from "cloudflare:workers";
import { StartSourceAiRequest } from "@river/contracts";
import { createRepository, schema } from "@river/db";
import { type AiProvider, defaultWorkspacePreferences, newId, type Principal } from "@river/domain";
import { Schema } from "effect";
import { expect, it } from "vitest";
import { decryptAiKey, encryptAiKey } from "../src/server/ai-credentials";
import { listProviderModels } from "../src/server/ai-models";
import { generateAiProposal } from "../src/server/ai-provider";
import { loadAiCredential, resolveAiModel } from "../src/server/ai-settings";

const encryption = { AI_CREDENTIAL_ENCRYPTION_KEY: "a1".repeat(32) };
it("accepts the UI's unset model override so an action can use the saved default", () => {
  const request = {
    idempotencyKey: "default-ai",
    sourceId: newId(),
    revision: 0,
    processingId: newId(),
    focus: "",
    contexts: [],
    ai: undefined,
  };
  expect(Schema.decodeUnknownSync(StartSourceAiRequest)(request)).toMatchObject(request);
});

async function fixture() {
  const store = createRepository(env.DB),
    id = newId();
  const actor: Principal = { kind: "owner", id, ownerId: id };
  await store.db.insert(schema.user).values({
    id,
    email: `${id}@example.test`,
    name: "AI fixture",
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return { store, actor };
}

it("encrypts keys with account, provider and revision binding and never exposes them in lists or audit", async () => {
  const { store, actor } = await fixture(),
    binding = { id: newId(), revision: 0, provider: "openai" as const };
  const secret = "synthetic-key-private",
    encryptedKey = await encryptAiKey(
      encryption.AI_CREDENTIAL_ENCRYPTION_KEY,
      actor.id,
      binding,
      secret,
    );
  expect(encryptedKey).not.toContain(secret);
  expect(
    await decryptAiKey(encryption.AI_CREDENTIAL_ENCRYPTION_KEY, actor.id, binding, encryptedKey),
  ).toBe(secret);
  await expect(
    decryptAiKey(encryption.AI_CREDENTIAL_ENCRYPTION_KEY, newId(), binding, encryptedKey),
  ).rejects.toMatchObject({ code: "Unavailable" });
  const input = {
    id: binding.id,
    revision: null,
    provider: binding.provider,
    idempotencyKey: "connect",
  };
  const value = { encryptedKey, keySuffix: "vate", fingerprint: "synthetic-fingerprint" };
  const saved = await store.saveAiConnection(actor, input, value);
  expect(await store.saveAiConnection(actor, input, value)).toEqual(saved);
  const storedConnection = await store.getAiConnection(actor.ownerId, binding.id);
  if (!storedConnection) throw Error("Missing saved connection");
  // Catalog loading supplies the complete stored row, including timestamps and ciphertext.
  await expect(loadAiCredential(encryption, store, actor.ownerId, storedConnection)).resolves.toBe(
    secret,
  );
  const publicRecords = JSON.stringify({
    list: await store.listAiConnections(actor.id),
    audit: await store.db.select().from(schema.audit),
    receipts: await store.db.select().from(schema.receipts),
  });
  expect(publicRecords).not.toContain(secret);
  expect(publicRecords).not.toContain(encryptedKey);
  expect(await store.listAiConnections(newId())).toEqual([]);
  await expect(loadAiCredential(encryption, store, newId(), binding)).rejects.toMatchObject({
    code: "Unavailable",
  });
});

it("pins queued tasks to a key revision and uses the account default only for new tasks", async () => {
  const { store, actor } = await fixture(),
    id = newId(),
    binding = { id, revision: 0, provider: "google" as const };
  const encryptedKey = await encryptAiKey(
    encryption.AI_CREDENTIAL_ENCRYPTION_KEY,
    actor.id,
    binding,
    "synthetic-first",
  );
  await store.saveAiConnection(
    actor,
    { id, revision: null, provider: "google", idempotencyKey: "first" },
    { encryptedKey, keySuffix: "irst", fingerprint: "first" },
  );
  await store.saveWorkspacePreferences(actor, {
    revision: 0,
    idempotencyKey: "default",
    preferences: {
      ...defaultWorkspacePreferences,
      defaultAi: { connectionId: id, model: "catalog-model" },
    },
  });
  expect(await resolveAiModel(encryption, store, actor.id)).toEqual({
    model: "catalog-model",
    connection: binding,
  });
  const replacement = { ...binding, revision: 1 };
  await store.saveAiConnection(
    actor,
    { id, revision: 0, provider: "google", idempotencyKey: "replace" },
    {
      encryptedKey: await encryptAiKey(
        encryption.AI_CREDENTIAL_ENCRYPTION_KEY,
        actor.id,
        replacement,
        "synthetic-second",
      ),
      keySuffix: "cond",
      fingerprint: "second",
    },
  );
  await expect(loadAiCredential(encryption, store, actor.id, binding)).rejects.toMatchObject({
    code: "Unavailable",
  });
  expect(await loadAiCredential(encryption, store, actor.id, replacement)).toBe("synthetic-second");
  await store.removeAiConnection(actor, { id, revision: 1, idempotencyKey: "remove" });
  expect(await resolveAiModel(encryption, store, actor.id)).toBeNull();
  const preferences = await store.getWorkspacePreferences(actor.id);
  expect(preferences.preferences.defaultAi).toBeNull();
  await store.saveWorkspacePreferences(actor, {
    revision: preferences.revision,
    idempotencyKey: "after-removal",
    preferences: { ...preferences.preferences, advancedTools: true },
  });
  expect((await store.getAiConnection(actor.id, id))?.encryptedKey).toBeNull();
  await expect(loadAiCredential(encryption, store, actor.id, replacement)).rejects.toMatchObject({
    code: "Unavailable",
  });
});

it("loads a catalog using request options supported by the Workers runtime", async () => {
  const models = await listProviderModels("openai", "synthetic", async (url, init) => {
    const request = new Request(url, init);
    expect(request.url).toBe("https://api.openai.com/v1/models");
    expect(request.headers.get("authorization")).toBe("Bearer synthetic");
    return Response.json({ data: [{ id: "synthetic-text-model" }] });
  });
  expect(models).toEqual([{ id: "synthetic-text-model", label: "synthetic-text-model" }]);
});

it("rejects catalog redirects without forwarding the credential", async () => {
  const requests: Request[] = [];
  await expect(
    listProviderModels("openai", "synthetic", async (url, init) => {
      requests.push(new Request(url, init));
      return new Response(null, { status: 302, headers: { location: "https://example.test" } });
    }),
  ).rejects.toMatchObject({ code: "Unavailable" });
  expect(requests).toHaveLength(1);
  expect(requests[0]?.redirect).toBe("manual");
  expect(requests[0]?.url).toBe("https://api.openai.com/v1/models");
});

it("loads dynamic catalogs, filters incompatible models, paginates, and hides provider errors", async () => {
  let calls = 0;
  const models = await listProviderModels("google", "synthetic", async (_url, init) => {
    expect(new Headers(init?.headers).get("x-goog-api-key")).toBe("synthetic");
    calls++;
    return Response.json(
      calls === 1
        ? {
            models: [
              { name: "models/new-text-model", supportedGenerationMethods: ["generateContent"] },
              { name: "models/embedding", supportedGenerationMethods: ["embedContent"] },
            ],
            nextPageToken: "page2",
          }
        : {
            models: [
              {
                name: "models/another-text-model",
                supportedGenerationMethods: ["generateContent"],
              },
            ],
          },
    );
  });
  expect(models.map((model) => model.id)).toEqual(["another-text-model", "new-text-model"]);
  expect(calls).toBe(2);
  await expect(
    listProviderModels("openai", "synthetic", async () =>
      Response.json({ error: "secret prompt" }, { status: 401 }),
    ),
  ).rejects.toMatchObject({
    code: "Unavailable",
    message:
      "Could not load models. Check your API key, provider access, and connection, then try again.",
  });
});

it.each(["openai", "anthropic", "google", "openrouter"] satisfies AiProvider[])(
  "executes a bounded structured request through %s without retries or tools",
  async (provider) => {
    const output = { message: "Synthetic response" };
    let calls = 0;
    const profile = {
      connection: { id: newId(), revision: 0, provider },
      model: "synthetic-model",
      maxInputCharacters: 160000,
      maxOutputTokens: 12000,
      timeoutMs: 60000,
    };
    const transport: typeof fetch = async (_url, init) => {
      calls++;
      // Validate options in workerd as real fetch does, before returning the synthetic response.
      new Request(_url, init);
      expect(init?.redirect).toBe("manual");
      const body = JSON.parse(String(init?.body));
      expect(body.tools).toBeUndefined();
      if (provider === "openai")
        return Response.json({
          id: "r",
          created_at: 1,
          model: profile.model,
          status: "completed",
          output: [
            {
              id: "m",
              type: "message",
              role: "assistant",
              status: "completed",
              content: [{ type: "output_text", text: JSON.stringify(output), annotations: [] }],
            },
          ],
        });
      if (provider === "anthropic")
        return Response.json({
          id: "m",
          type: "message",
          role: "assistant",
          model: profile.model,
          content: [{ type: "text", text: JSON.stringify(output) }],
          stop_reason: "end_turn",
          stop_sequence: null,
          usage: { input_tokens: 10, output_tokens: 10 },
        });
      if (provider === "google")
        return Response.json({
          candidates: [
            {
              content: { role: "model", parts: [{ text: JSON.stringify(output) }] },
              finishReason: "STOP",
            },
          ],
          modelVersion: profile.model,
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 10, totalTokenCount: 20 },
        });
      return Response.json({
        id: "m",
        model: profile.model,
        created: 1,
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: JSON.stringify(output) },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
      });
    };
    const executions: import("@river/domain").AiExecutionMetadata[] = [];
    expect(
      await generateAiProposal(
        "synthetic",
        { text: "sample" },
        profile,
        "Return JSON",
        "sample",
        {
          type: "object",
          properties: { message: { type: "string" } },
          required: ["message"],
          additionalProperties: false,
        },
        transport,
        async (metadata) => {
          executions.push(metadata);
        },
      ),
    ).toEqual(output);
    expect(calls).toBe(1);
    expect(executions).toHaveLength(1);
    expect(executions[0]).toMatchObject({
      connection: profile.connection,
      requestedModel: profile.model,
      returnedModel: profile.model,
    });
    calls = 0;
    await expect(
      generateAiProposal(
        "synthetic",
        {},
        profile,
        "Return JSON",
        "sample",
        { type: "object" },
        async () => {
          calls++;
          return Response.json({ error: { message: "private prompt" } }, { status: 429 });
        },
      ),
    ).rejects.toMatchObject({ code: "Unavailable" });
    expect(calls).toBe(1);
  },
);

it("rejects provider redirects without following them or exposing response content", async () => {
  let calls = 0;
  await expect(
    generateAiProposal(
      "synthetic-private-key",
      { text: "synthetic-private-source" },
      {
        connection: { id: newId(), revision: 0, provider: "openai" },
        model: "synthetic-model",
        maxInputCharacters: 1000,
        maxOutputTokens: 100,
        timeoutMs: 1000,
      },
      "Return JSON",
      "sample",
      { type: "object" },
      async (url, init) => {
        calls++;
        const request = new Request(url, init);
        expect(request.url).toBe("https://api.openai.com/v1/responses");
        expect(request.redirect).toBe("manual");
        return new Response("synthetic-private-source", {
          status: 302,
          headers: { Location: "https://unexpected.example/collect" },
        });
      },
    ),
  ).rejects.toMatchObject({
    code: "Unavailable",
    diagnostic: { category: "request_rejected", httpStatus: 302 },
    message:
      "Your provider rejected the request for this model. Choose another model for a new task or contact support.",
  });
  expect(calls).toBe(1);
});

it("saves starters atomically, rejects incomplete fields, and derives onboarding from account work", async () => {
  const { store, actor } = await fixture();
  expect(await store.getOnboardingProgress(actor.id)).toEqual({
    evidence: 0,
    job: 0,
    content: 0,
    draft: 0,
    review: 0,
    exported: 0,
  });
  const input = {
    idempotencyKey: "contact",
    type: "contact" as const,
    label: "Contact",
    fields: [
      { key: "name" as const, values: ["Fictional Test Person"] },
      { key: "lines" as const, values: ["test@example.test"] },
    ],
  };
  const result = await store.createLibraryStarter(actor, input);
  expect(await store.createLibraryStarter(actor, input)).toEqual(result);
  const detail = await store.inspectLibrary(actor.id, { id: result.id });
  expect(detail.graph).toHaveLength(4);
  expect((await store.getOnboardingProgress(actor.id)).content).toBe(1);
  const count = (await store.db.select().from(schema.libraryItems)).length;
  await expect(
    store.createLibraryStarter(actor, { ...input, idempotencyKey: "invalid", fields: [] }),
  ).rejects.toMatchObject({ code: "InvalidInput" });
  expect(await store.db.select().from(schema.libraryItems)).toHaveLength(count);
  await expect(
    store.saveWorkspacePreferences(actor, {
      revision: 0,
      idempotencyKey: "foreign",
      preferences: {
        ...defaultWorkspacePreferences,
        defaultAi: { connectionId: newId(), model: "other" },
      },
    }),
  ).rejects.toMatchObject({ code: "Conflict" });
});

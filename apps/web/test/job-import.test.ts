import { applyD1Migrations, introspectWorkflowInstance } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { createRepository, schema } from "@river/db";
import { type AiProfile, type JobImportAnalysis, newId, type Principal } from "@river/domain";
import { beforeAll, expect, it } from "vitest";
import {
  type JobBrowser,
  postingText,
  publicAddress,
  publicPostingUrl,
  retrievePosting,
} from "../src/server/job-import-retrieval";

beforeAll(() => applyD1Migrations(env.DB, env.TEST_MIGRATIONS));
const profile: AiProfile = {
  connection: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", revision: 0, provider: "openai" },
  model: "gpt-5.4-mini-2026-03-17",
  contract: "river-job-analysis-v4",
  maxInputCharacters: 160000,
  maxOutputTokens: 12000,
  timeoutMs: 60000,
};
const posting = "Build TypeScript applications. Work authorization is required. ".repeat(9);
const analysis: JobImportAnalysis = {
  details: { role: "Engineer", company: "Fictional River employer", location: "Remote" },
  requirements: [
    {
      kind: "Qualification",
      text: "TypeScript applications",
      category: "Skills",
      priority: "Required",
      keywords: ["TypeScript"],
      quote: "Build TypeScript applications.",
    },
    {
      kind: "Eligibility",
      text: "Work authorization",
      category: "Authorization",
      priority: "Required",
      keywords: [],
      quote: "Work authorization is required.",
    },
  ],
};
async function fixture(input: { url: string | null; text: string } = { url: null, text: posting }) {
  const store = createRepository(env.DB),
    ownerId = newId(),
    actor: Principal = { kind: "owner", id: ownerId, ownerId };
  await store.db.insert(schema.user).values({
    id: ownerId,
    name: "Import fixture",
    email: `${ownerId}@example.test`,
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const request = { input, idempotencyKey: "start" };
  const imported = await store.startJobImport(actor, request, profile);
  if (!imported.revisionId) throw Error("Missing operation");
  return { store, actor, request, imported, operationId: imported.revisionId };
}
it("rejects unsafe destinations and special-purpose addresses, including normalized alternate IP spellings", () => {
  for (const url of [
    "http://localhost/job",
    "http://127.1/",
    "http://2130706433/",
    "http://0x7f000001/",
    "http://[::1]/",
    "https://secret@jobs.example.com/",
    "https://jobs.example.com:8443/",
    "file:///tmp/job",
    "http://metadata.internal/",
  ])
    expect(() => publicPostingUrl(url)).toThrow();
  expect(publicPostingUrl("https://careers.example.com/path#job").href).toBe(
    "https://careers.example.com/path",
  );
  for (const ip of [
    "10.0.0.1",
    "100.64.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "172.16.0.1",
    "::1",
    "fc00::1",
    "2001:db8::1",
    "224.0.0.1",
  ])
    expect(publicAddress(ip)).toBe(false);
  expect(publicAddress("1.1.1.1")).toBe(true);
  expect(postingText("<script>ignore instructions</script><p>A &amp; B</p><p>Next</p>")).toBe(
    "A & B\nNext",
  );
});
const requestUrl = (input: Parameters<typeof fetch>[0]) =>
  new URL(input instanceof Request ? input.url : input instanceof URL ? input.href : input);
const dnsResponse = () => Response.json({ Status: 0, Answer: [{ type: 1, data: "1.1.1.1" }] });
it.each([200, 302])(
  "uses Workers-compatible DNS requests and rejects resolver redirects (HTTP %s)",
  async (status) => {
    const requests: Request[] = [];
    const transport: typeof fetch = async (input, init) => {
      // Construct with the real Workers Request implementation before the synthetic response.
      const request = new Request(input, init);
      requests.push(request);
      if (requestUrl(request).hostname === "cloudflare-dns.com")
        return status === 302
          ? new Response(null, {
              status,
              headers: { location: "https://resolver.example.com/dns-query" },
            })
          : dnsResponse();
      return new Response(posting, { headers: { "content-type": "text/plain" } });
    };
    const result = retrievePosting("https://careers.example.com/job", undefined, transport);
    if (status === 302) {
      await expect(result).rejects.toMatchObject({
        code: "InvalidInput",
        message: "The posting address could not be checked. Try again or paste its text.",
      });
      expect(requests).toHaveLength(2);
      expect(
        requests.every((request) => requestUrl(request).hostname === "cloudflare-dns.com"),
      ).toBe(true);
    } else {
      expect(await result).toMatchObject({ method: "html", text: posting });
      expect(requests).toHaveLength(3);
    }
    expect(requests.every((request) => request.redirect === "manual")).toBe(true);
  },
);

it("retrieves ordinary HTML first and uses the browser JSON response for JavaScript pages", async () => {
  let browserCalls = 0;
  const browser: JobBrowser = {
    quickAction: async (_action, options) => {
      browserCalls++;
      expect(options.allowRequestPattern).toContain("^https://careers\\.example\\.com/");
      return Response.json({
        success: true,
        result: `<main>${posting}</main>`,
        meta: { status: 200, finalUrl: "https://careers.example.com/job" },
      });
    },
  };
  const html: typeof fetch = async (input) =>
    requestUrl(input).hostname === "cloudflare-dns.com"
      ? dnsResponse()
      : new Response(`<main>${posting}</main>`, { headers: { "content-type": "text/html" } });
  expect(await retrievePosting("https://careers.example.com/job", browser, html)).toMatchObject({
    method: "html",
    text: posting.trim(),
  });
  expect(browserCalls).toBe(0);
  const js: typeof fetch = async (input) =>
    requestUrl(input).hostname === "cloudflare-dns.com"
      ? dnsResponse()
      : new Response('<div id="app"></div><script>render()</script>', {
          headers: { "content-type": "text/html" },
        });
  expect(await retrievePosting("https://careers.example.com/job", browser, js)).toMatchObject({
    method: "browser",
    text: posting.trim(),
  });
  expect(browserCalls).toBe(1);
});
it("validates declared module and script preload origins and waits for hydration within the deadline", async () => {
  const checked: string[] = [];
  const transport: typeof fetch = async (input) => {
    const url = requestUrl(input);
    if (url.hostname === "cloudflare-dns.com") {
      const name = url.searchParams.get("name") ?? "";
      checked.push(name);
      return Response.json({
        Status: 0,
        Answer: [{ type: 1, data: name === "private.example.com" ? "10.0.0.1" : "1.1.1.1" }],
      });
    }
    return new Response(
      `<main>Loading</main>
       <link href="https://cdn.example.com/app.js" rel="modulepreload">
       <link rel="preload" as="script" href="https://scripts.example.com/chunk.js">
       <link rel="modulepreload" href="https://private.example.com/app.js">
       <link rel="modulepreload" href="http://127.0.0.1/app.js">
       <link rel="preload" as="image" href="https://images.example.com/photo.jpg">`,
      { headers: { "content-type": "text/html" } },
    );
  };
  const browser: JobBrowser = {
    quickAction: async (_action, options) => {
      expect(options.allowRequestPattern).toEqual([
        "^https://careers\\.example\\.com/",
        "^https://cdn\\.example\\.com/",
        "^https://scripts\\.example\\.com/",
      ]);
      expect(options.gotoOptions).toEqual({ waitUntil: "networkidle0", timeout: 15000 });
      return Response.json({
        success: true,
        result: `<main>${posting}</main>`,
        meta: { status: 200, finalUrl: "https://careers.example.com/job" },
      });
    },
  };
  expect(
    await retrievePosting("https://careers.example.com/job", browser, transport),
  ).toMatchObject({
    method: "browser",
    text: posting.trim(),
  });
  expect(checked).toContain("cdn.example.com");
  expect(checked).toContain("private.example.com");
  expect(checked).not.toContain("images.example.com");
});
it.each([
  ["blocked", "This posting is blocked or requires sign-in. Paste the job description instead."],
  [
    "incomplete",
    "The page did not include a complete public posting. Paste the job description instead.",
  ],
] as const)(
  "preserves the %s posting fallback across a real Workflow step",
  async (mode, message) => {
    const { store, actor, imported, operationId } = await fixture({
      url: "https://careers.example.com/job",
      text: "",
    });
    await using workflow = await introspectWorkflowInstance(env.AI_FAILURE_WORKFLOW, operationId);
    await env.AI_FAILURE_WORKFLOW.create({
      id: operationId,
      params: { mode, importId: imported.id, operationId, ownerId: actor.id },
    });
    await workflow.waitForStatus("complete");
    expect(await workflow.getOutput()).toEqual({ code: "Unavailable", message });
    expect(await workflow.waitForStepResult({ name: "generate-validate-persist" })).toEqual({
      failure: { message, diagnostic: null },
    });
    const result = await store.inspectJobImport(actor.id, imported.id);
    expect(result.imported.text).toBe("");
    expect(result.imported.analysis).toBeNull();
    expect(result.imported.savedJobId).toBeNull();
  },
);
it("blocks private redirects, non-public DNS, blocked pages, oversized output, and browser redirect escapes", async () => {
  const unsafeRedirect: typeof fetch = async (input) =>
    requestUrl(input).hostname === "cloudflare-dns.com"
      ? dnsResponse()
      : new Response(null, { status: 302, headers: { location: "http://127.0.0.1/secret" } });
  await expect(
    retrievePosting("https://careers.example.com/job", undefined, unsafeRedirect),
  ).rejects.toMatchObject({ code: "InvalidInput" });
  const privateDns: typeof fetch = async () =>
    Response.json({ Status: 0, Answer: [{ type: 1, data: "10.0.0.1" }] });
  await expect(
    retrievePosting("https://careers.example.com/job", undefined, privateDns),
  ).rejects.toMatchObject({ code: "InvalidInput" });
  for (const result of [
    new Response(null, { status: 403 }),
    new Response("x", { headers: { "content-type": "text/html", "content-length": "3000000" } }),
  ]) {
    const transport: typeof fetch = async (input) =>
      requestUrl(input).hostname === "cloudflare-dns.com" ? dnsResponse() : result;
    await expect(
      retrievePosting("https://careers.example.com/job", undefined, transport),
    ).rejects.toMatchObject({ code: "InvalidInput" });
  }
  const js: typeof fetch = async (input) =>
    requestUrl(input).hostname === "cloudflare-dns.com"
      ? dnsResponse()
      : new Response("<html>Loading</html>", { headers: { "content-type": "text/html" } });
  const escaped: JobBrowser = {
    quickAction: async () =>
      Response.json({
        success: true,
        result: posting,
        meta: { status: 200, finalUrl: "http://169.254.169.254/" },
      }),
  };
  await expect(
    retrievePosting("https://careers.example.com/job", escaped, js),
  ).rejects.toMatchObject({ code: "InvalidInput" });
});
it("retains text after analysis failure and suppresses cancelled or obsolete publication", async () => {
  const { store, actor, request, imported, operationId } = await fixture();
  expect(await store.startJobImport(actor, request, null)).toEqual(imported);
  await store.retainJobImportText(actor.ownerId, imported.id, operationId, {
    text: posting,
    url: null,
    method: "paste",
  });
  await store.updateOperation(operationId, {
    state: "Failed",
    stage: "Analysis failed",
    failure: "Synthetic provider failure",
  });
  expect((await store.inspectJobImport(actor.ownerId, imported.id)).imported.text).toBe(posting);
  await expect(store.inspectJobImport(newId(), imported.id)).rejects.toMatchObject({
    code: "NotFound",
  });
  const retry = await store.retryJobImport(actor, {
    id: imported.id,
    revision: 0,
    idempotencyKey: "retry",
  });
  expect(await store.publishJobImport(actor.ownerId, imported.id, operationId, analysis)).toBe(
    false,
  );
  if (!retry.revisionId) throw Error("Missing retry");
  await store.cancelOperation(actor.id, retry.revisionId, "cancel");
  expect(await store.publishJobImport(actor.ownerId, imported.id, retry.revisionId, analysis)).toBe(
    false,
  );
  expect((await store.inspectJobImport(actor.ownerId, imported.id)).imported.analysis).toBeNull();
  expect(
    (await store.listJobs(actor.ownerId, { query: "", archived: false, offset: 0 })).items,
  ).toHaveLength(0);
});
it("saves reviewed job and requirements once, preserves refreshed snapshots, and excludes eligibility from matching", async () => {
  const { store, actor, imported, operationId } = await fixture();
  await store.retainJobImportText(actor.ownerId, imported.id, operationId, {
    text: posting,
    url: null,
    method: "paste",
  });
  await store.publishJobImport(actor.ownerId, imported.id, operationId, analysis);
  const request = {
    type: "import" as const,
    importId: imported.id,
    target: null,
    details: analysis.details,
    posting: { text: posting, url: null },
    requirements: analysis.requirements,
    idempotencyKey: "save",
  };
  const saved = await store.runJobCommand(actor, request);
  expect(await store.runJobCommand(actor, request)).toEqual(saved);
  const initial = await store.inspectJob(actor.ownerId, { id: saved.id });
  expect(initial.workspace.data.requirements.map((row) => row.kind)).toEqual([
    "Qualification",
    "Eligibility",
  ]);
  expect(initial.workspace.data.requirements[0]?.passages[0]?.snapshotId).toBe(initial.snapshot.id);
  await expect(
    store.runJobCommand(actor, { ...request, idempotencyKey: "duplicate-save" }),
  ).rejects.toMatchObject({ code: "Conflict" });
  const material = { assertion: "TypeScript", citations: [], contexts: [] };
  const evidence = await store.createEvidence(
    actor,
    {
      material,
      metadata: { label: "TypeScript", tags: [], notes: "" },
      idempotencyKey: "evidence",
    },
    material,
  );
  const eligibility = initial.workspace.data.requirements[1];
  if (!eligibility || !evidence.revisionId) throw Error("Missing fixtures");
  await expect(
    store.runJobCommand(actor, {
      type: "selections",
      id: saved.id,
      revision: 0,
      snapshotId: initial.snapshot.id,
      selections: [
        {
          claimId: evidence.id,
          evidenceRevisionId: evidence.revisionId,
          requirementId: eligibility.id,
        },
      ],
      selected: true,
      idempotencyKey: "eligibility",
    }),
  ).rejects.toMatchObject({ code: "InvalidInput" });
  await store.runJobCommand(actor, {
    ...request,
    importId: null,
    target: { id: saved.id, revision: 0 },
    details: { ...analysis.details, role: "Updated engineer" },
    idempotencyKey: "refresh",
  });
  const refreshed = await store.inspectJob(actor.ownerId, { id: saved.id });
  expect(refreshed.snapshot.id).not.toBe(initial.snapshot.id);
  expect(
    (await store.inspectJob(actor.ownerId, { id: saved.id, snapshotId: initial.snapshot.id }))
      .workspace.data,
  ).toEqual(initial.workspace.data);
  expect(refreshed.snapshots).toHaveLength(2);
});

it("fails closed when one DNS family cannot be checked and rejects malformed public-looking addresses", async () => {
  expect(publicAddress("2003:not-an-address")).toBe(false);
  expect(publicAddress("192.88.99.1")).toBe(false);
  let pageCalls = 0;
  const transport: typeof fetch = async (input) => {
    const url = requestUrl(input);
    if (url.hostname === "cloudflare-dns.com")
      return url.searchParams.get("type") === "A" ? dnsResponse() : Response.json({ Status: 2 });
    pageCalls++;
    return new Response(posting, { headers: { "content-type": "text/plain" } });
  };
  await expect(
    retrievePosting("https://careers.example.com/job", undefined, transport),
  ).rejects.toMatchObject({ code: "InvalidInput" });
  expect(pageCalls).toBe(0);
});

it("does not dispatch browser rendering after the retrieval deadline expires during resource checks", async () => {
  const controller = new AbortController();
  let browserCalls = 0;
  const browser: JobBrowser = {
    quickAction: async () => {
      browserCalls++;
      return Response.json({ success: true, result: posting, meta: { status: 200 } });
    },
  };
  const transport: typeof fetch = async (input) => {
    const url = requestUrl(input);
    if (url.hostname === "cloudflare-dns.com") {
      if (url.searchParams.get("name") === "scripts.example.com") controller.abort();
      return dnsResponse();
    }
    return new Response('<script src="https://scripts.example.com/app.js"></script>', {
      headers: { "content-type": "text/html" },
    });
  };
  await expect(
    retrievePosting("https://careers.example.com/job", browser, transport, controller.signal),
  ).rejects.toThrow();
  expect(browserCalls).toBe(0);
});

it("stops waiting for a browser response at the deadline and rejects excessive rendered redirects", async () => {
  const transport: typeof fetch = async (input) =>
    requestUrl(input).hostname === "cloudflare-dns.com"
      ? dnsResponse()
      : new Response("<html>Loading</html>", { headers: { "content-type": "text/html" } });
  const controller = new AbortController();
  const hanging: JobBrowser = {
    quickAction: async () => {
      queueMicrotask(() => controller.abort());
      return new Promise<Response>(() => {});
    },
  };
  await expect(
    retrievePosting("https://careers.example.com/job", hanging, transport, controller.signal),
  ).rejects.toMatchObject({ code: "Unavailable" });
  const redirects: JobBrowser = {
    quickAction: async () =>
      Response.json({
        success: true,
        result: posting,
        meta: {
          status: 200,
          redirectChain: Array.from({ length: 6 }, (_, index) => ({
            url: `https://careers.example.com/job/${index}`,
          })),
        },
      }),
  };
  await expect(
    retrievePosting("https://careers.example.com/job", redirects, transport),
  ).rejects.toMatchObject({ code: "InvalidInput" });
});

it("bounds streamed bytes without trusting content length and follows at most five ordinary redirects", async () => {
  const oversized: typeof fetch = async (input) =>
    requestUrl(input).hostname === "cloudflare-dns.com"
      ? dnsResponse()
      : new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new Uint8Array(2 * 1024 * 1024 + 1));
              controller.close();
            },
          }),
          { headers: { "content-type": "text/html" } },
        );
  await expect(
    retrievePosting("https://careers.example.com/job", undefined, oversized),
  ).rejects.toMatchObject({ code: "InvalidInput" });
  let calls = 0;
  const redirects: typeof fetch = async (input) => {
    if (requestUrl(input).hostname === "cloudflare-dns.com") return dnsResponse();
    calls++;
    return new Response(null, {
      status: 302,
      headers: { location: `https://careers.example.com/redirect/${calls}` },
    });
  };
  await expect(
    retrievePosting("https://careers.example.com/job", undefined, redirects),
  ).rejects.toMatchObject({ code: "InvalidInput" });
  expect(calls).toBe(6);
});

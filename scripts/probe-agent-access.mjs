import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout } from "node:timers/promises";

// Explicitly approved hosted QA only. The credential value is read from a private file, never argv.
const [tokenPath] = process.argv.slice(2);
if (!tokenPath || process.argv.length !== 3)
  throw Error("Supply one private credential-file path.");
const token = (await readFile(tokenPath, "utf8")).trim();
if (!/^river_[a-f0-9-]{36}\.[a-f0-9]{64}$/.test(token)) throw Error("Invalid credential file.");
const origin = "https://river-staging.jilva.workers.dev";
const runId = randomUUID();
const directory = resolve("test-results/agent-access", runId);
await mkdir(directory, { recursive: true, mode: 0o700 });
const receipt = { runId, origin, credentialId: token.slice(6, 42), status: "running", checks: [] };
const save = () =>
  writeFile(resolve(directory, "report.json"), JSON.stringify(receipt, null, 2), { mode: 0o600 });
const passed = async (label) => {
  receipt.checks.push(label);
  await save();
  console.log(label);
};
const key = (operation) => `${runId}:${operation}`;

async function request(path, body, expected = 200) {
  const response = await fetch(`${origin}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2025-03-26",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(30_000),
    redirect: "error",
  });
  if (response.status !== expected)
    throw Error(`${path} returned ${response.status}; expected ${expected}.`);
  const text = await response.text();
  const data = response.headers.get("content-type")?.includes("text/event-stream")
    ? text
        .split("\n")
        .filter((line) => line.startsWith("data: "))
        .map((line) => line.slice(6))
        .join("\n")
    : text;
  return JSON.parse(data);
}
const rpc = (method, params = {}) => request("/mcp", { jsonrpc: "2.0", id: 1, method, params });
async function tool(name, args, errorStatus) {
  const envelope = await rpc("tools/call", { name, arguments: args });
  const result = envelope.result;
  if (!result) throw Error(`MCP ${name} returned a protocol error.`);
  const payload =
    result.structuredContent ??
    JSON.parse(result.content.find((entry) => entry.type === "text").text);
  if (errorStatus) {
    assert.equal(result.isError, true);
    assert.equal(payload.error.status, errorStatus);
    return payload.error;
  }
  assert.equal(result.isError, false);
  return payload.data;
}

try {
  const identity = await request("/api/v1/me");
  assert.equal(identity.kind, "agent");
  assert.equal(identity.id, receipt.credentialId);
  assert.deepEqual(
    identity.scopes.toSorted(),
    [
      "source:read",
      "source:write",
      "evidence:read",
      "evidence:write",
      "jobs:read",
      "jobs:write",
    ].toSorted(),
  );
  const listing = await rpc("tools/list");
  const names = listing.result.tools.map((entry) => entry.name).toSorted();
  assert.deepEqual(
    names,
    [
      "search_evidence",
      "get_evidence",
      "list_contexts",
      "list_duplicates",
      "evidence_command",
      "list_jobs",
      "get_job",
      "job_command",
      "list_sources",
      "get_source",
      "create_source",
      "retry_source",
      "resume_source_upload",
    ].toSorted(),
  );
  await passed("Authenticated REST identity and exact scoped MCP tools");

  const quote =
    "Fictional candidate Avery Example implemented a synthetic keyboard navigation fixture.";
  const sourceText = `Synthetic River QA ${runId}. Not Owner evidence.\n${quote}\nUnicode check: café — résumé.\n`;
  const sourceInput = {
    idempotencyKey: key("source"),
    title: `Synthetic agent QA ${runId}`,
    filename: "synthetic-agent-qa.txt",
    mime: "text/plain",
    kind: "pasted",
    provenanceUrl: null,
    note: "Approved QA fixture only. Not evidence of the Owner's qualifications.",
    contentBase64: Buffer.from(sourceText).toString("base64"),
  };
  const source = await request("/api/v1/sources", sourceInput, 201);
  receipt.sourceId = source.id;
  await save();
  assert.deepEqual(await tool("create_source", sourceInput), source);
  let inspection;
  for (let attempt = 0; attempt < 30; attempt++) {
    inspection = await tool("get_source", { id: source.id });
    if (inspection.extraction) break;
    if (inspection.source.state === "Failed") throw Error("Synthetic source extraction failed.");
    await setTimeout(2000);
  }
  assert.equal(inspection.extraction?.text, sourceText);
  receipt.processingId = inspection.processingId;
  const downloaded = await fetch(`${origin}/api/v1/sources/${source.id}?download`, {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(30_000),
    redirect: "error",
  });
  assert.equal(downloaded.status, 200);
  assert.equal(await downloaded.text(), sourceText);
  await passed(
    "Immutable source upload, cross-interface replay, exact extraction and authenticated download",
  );

  const start = sourceText.indexOf(quote);
  const material = {
    assertion: quote,
    citations: [
      {
        sourceId: source.id,
        processingId: inspection.processingId,
        quote,
        start,
        end: start + quote.length,
      },
    ],
    contexts: [],
  };
  const metadata = {
    label: `Synthetic agent QA ${runId}`,
    tags: ["synthetic", "agent-qa"],
    notes: "Fictional fixture; never verify as Owner evidence.",
  };
  const create = { type: "create", idempotencyKey: key("claim"), material, metadata };
  const created = await tool("evidence_command", { command: create });
  receipt.claimId = created.id;
  await save();
  assert.deepEqual(await request("/api/v1/evidence", create), created);
  let evidence = await tool("get_evidence", { id: created.id });
  assert.equal(evidence.claim.reviewState, "Draft");
  assert.equal(evidence.decisions.length, 0);
  const citation = evidence.revisions[0].material.citations[0];
  assert.equal(sourceText.slice(citation.start, citation.end), citation.quote);
  assert.equal(citation.processingId, inspection.processingId);
  assert.equal(
    (await request(`/api/v1/evidence?query=${encodeURIComponent(runId)}`)).items.length,
    1,
  );
  const update = {
    type: "metadata",
    id: created.id,
    revision: evidence.claim.revision,
    idempotencyKey: key("metadata"),
    metadata: { ...metadata, notes: "Fictional fixture updated through REST; not Owner evidence." },
  };
  await request("/api/v1/evidence", update);
  await tool(
    "evidence_command",
    {
      command: {
        ...update,
        idempotencyKey: key("stale"),
        metadata: { ...metadata, notes: "Stale write must not commit." },
      },
    },
    409,
  );
  evidence = await tool("get_evidence", { id: created.id });
  assert.equal(evidence.claim.metadata.notes, update.metadata.notes);
  await tool(
    "evidence_command",
    {
      command: {
        type: "review",
        id: created.id,
        revision: evidence.claim.revision,
        revisionId: evidence.claim.currentRevisionId,
        state: "Draft",
        rationale: "Scope-denial test; no verification requested.",
        idempotencyKey: key("deny-review"),
      },
    },
    403,
  );
  await request(
    "/api/v1/evidence",
    {
      type: "archive",
      id: created.id,
      revision: evidence.claim.revision,
      archived: true,
      rationale: "Scope-denial test",
      idempotencyKey: key("deny-archive"),
    },
    403,
  );
  const after = await tool("get_evidence", { id: created.id });
  assert.equal(after.claim.revision, evidence.claim.revision);
  assert.equal(after.decisions.length, 0);
  assert.equal(after.claim.archivedAt, null);
  receipt.evidenceRevisionId = evidence.claim.currentRevisionId;
  await passed(
    "Cited Draft creation, shared idempotency, stale-write rejection and review/archive scope denial",
  );

  const postingText =
    "Synthetic opening. Requires keyboard navigation implementation. Not a real job.";
  const jobCommand = {
    type: "create",
    idempotencyKey: key("job"),
    details: {
      role: `Synthetic agent QA ${runId}`,
      company: "Fictional Example Company",
      location: "Synthetic fixture",
    },
    posting: { text: postingText, url: null },
  };
  const job = await request("/api/v1/jobs", jobCommand);
  receipt.jobId = job.id;
  await save();
  assert.deepEqual(await tool("job_command", { command: jobCommand }), job);
  let target = await tool("get_job", { id: job.id });
  const requirement = {
    type: "requirement",
    id: job.id,
    revision: target.job.revision,
    snapshotId: target.snapshot.id,
    requirementId: null,
    idempotencyKey: key("requirement"),
    fields: {
      text: "Keyboard navigation implementation",
      category: "Skill",
      priority: "Required",
      keywords: ["keyboard navigation"],
      confidence: null,
      passages: [
        { snapshotId: target.snapshot.id, quote: postingText, start: 0, end: postingText.length },
      ],
    },
  };
  await tool("job_command", { command: requirement });
  target = await tool("get_job", { id: job.id });
  const selection = {
    claimId: created.id,
    evidenceRevisionId: evidence.claim.currentRevisionId,
    requirementId: target.workspace.data.requirements[0].id,
  };
  await request("/api/v1/jobs", {
    type: "selection",
    id: job.id,
    revision: target.job.revision,
    snapshotId: target.snapshot.id,
    selection,
    selected: true,
    idempotencyKey: key("selection"),
  });
  target = await tool("get_job", { id: job.id });
  assert.deepEqual(target.workspace.data.selections, [selection]);
  await request("/api/v1/jobs", {
    type: "archive",
    id: job.id,
    revision: target.job.revision,
    archived: true,
    rationale: "Completed fictional agent QA fixture.",
    idempotencyKey: key("archive-job"),
  });
  assert.ok((await tool("get_job", { id: job.id })).job.archivedAt);
  await passed(
    "Job snapshot, manual requirement, exact evidence selection and fictional job archival",
  );
  receipt.status = "passed; credential revocation and Owner claim cleanup pending";
  await save();
  console.log(JSON.stringify({ report: resolve(directory, "report.json"), ...receipt }, null, 2));
} catch (error) {
  receipt.status = "failed";
  receipt.failure = error instanceof Error ? error.message : "Probe failed";
  await save();
  console.error(
    JSON.stringify({
      status: receipt.status,
      report: resolve(directory, "report.json"),
      failure: receipt.failure,
    }),
  );
  process.exitCode = 1;
}

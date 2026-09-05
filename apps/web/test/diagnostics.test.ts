import { Effect, Exit, Schema } from "effect";
import { afterEach, expect, it, vi } from "vitest";
import { withDiagnostics } from "../src/server/diagnostics";

const LogEntry = Schema.Struct({
  message: Schema.String,
  annotations: Schema.Record(Schema.String, Schema.Unknown),
  spans: Schema.Record(Schema.String, Schema.Number),
});
afterEach(() => vi.restoreAllMocks());

it("preserves concurrent outcomes while logging identifiers without payloads or exception causes", async () => {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const privateText = "PRIVATE_SOURCE_RESUME_JOB_AND_API_TOKEN";
  const programs = [
    Effect.succeed({ source: privateText }),
    Effect.fail(new Error(privateText)),
    Effect.die(new Error(privateText)),
  ];
  const results = await Promise.all(
    programs.map((program, index) =>
      Effect.runPromise(
        program.pipe(
          withDiagnostics({
            scope: "application",
            traceId: `request-${index}`,
            actorId: `actor-${index}`,
            permission: "owner",
          }),
          Effect.exit,
        ),
      ),
    ),
  );
  expect(results.map(Exit.isSuccess)).toEqual([true, false, false]);
  expect(results[0]).toMatchObject({ value: { source: privateText } });
  const entries = log.mock.calls.map(([message]) =>
    Schema.decodeUnknownSync(LogEntry)(JSON.parse(String(message))),
  );
  expect(entries).toHaveLength(3);
  for (const [index, outcome] of ["succeeded", "failed", "failed"].entries()) {
    expect(entries).toContainEqual({
      message: "river.application",
      annotations: {
        traceId: `request-${index}`,
        actorId: `actor-${index}`,
        permission: "owner",
        outcome,
      },
      spans: { "river.application": expect.any(Number) },
    });
  }
  expect(JSON.stringify(log.mock.calls)).not.toContain(privateText);
});

it("reports interrupted work without logging the interrupted effect", async () => {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  await Effect.runPromise(
    Effect.never.pipe(
      withDiagnostics({
        scope: "application",
        traceId: "interrupted",
        actorId: null,
        permission: "identity",
      }),
      Effect.timeout(2),
      Effect.exit,
    ),
  );
  expect(log).toHaveBeenCalledOnce();
  const entry = Schema.decodeUnknownSync(LogEntry)(JSON.parse(String(log.mock.calls[0]?.[0])));
  expect(entry.annotations).toMatchObject({
    traceId: "interrupted",
    actorId: "anonymous",
    outcome: "failed",
  });
});

it("links dispatch to its stable Workflow identity without exposing provider failures", async () => {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const privateFailure = "signed-url-and-private-provider-response";
  await Effect.runPromise(
    Effect.fail(new Error(privateFailure)).pipe(
      withDiagnostics({
        scope: "workflow-dispatch",
        operationId: "operation-1",
        ownerId: "owner-1",
      }),
      Effect.exit,
    ),
  );
  const entry = Schema.decodeUnknownSync(LogEntry)(JSON.parse(String(log.mock.calls[0]?.[0])));
  expect(entry).toMatchObject({
    message: "river.workflow-dispatch",
    annotations: {
      operationId: "operation-1",
      workflowId: "operation-1",
      ownerId: "owner-1",
      outcome: "failed",
    },
  });
  expect(JSON.stringify(log.mock.calls)).not.toContain(privateFailure);
});

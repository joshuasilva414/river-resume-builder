import { env } from "cloudflare:workers";
import { createRepository, schema } from "@river/db";
import { newId, type Principal } from "@river/domain";
import { renderingFixture, resolveDocument } from "@river/domain/workspace";
import { Effect, Layer } from "effect";
import { expect, it, vi } from "vitest";
import { Actor, Store } from "../src/server/services";
import { scoreWorkspace, type WorkspaceScoreRequest } from "../src/server/workspace-scoring";
import { syntheticScoringResponse, syntheticScoringVersion } from "./fixtures/scoring";

async function fixture() {
  const repository = createRepository(env.DB),
    id = newId();
  const actor: Principal = { kind: "owner", id, ownerId: id };
  await repository.db.insert(schema.user).values({
    id,
    email: `${id}@test.invalid`,
    name: "Score fixture",
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const resume = renderingFixture(1),
    templateId = newId();
  await repository.saveWorkspaceRecord(actor, {
    id: templateId,
    revision: 0,
    idempotencyKey: newId(),
    payload: { kind: "template", data: resume.template.document },
  });
  const samples = [0, 1, 2].map((index) => ({
    name: `Fictional ${index}`,
    resume: {
      ...resume,
      job: {
        id: `fictional-${index}`,
        title: "Engineer",
        description: "Build accessible React products.",
      },
    },
    text: resolveDocument(resume).expectedText.join("\n"),
    renderer: "browser-fixture",
    fonts: "fixture",
    mapped: true as const,
  }));
  const input: WorkspaceScoreRequest = {
    kind: "template-score",
    documentId: templateId,
    template: resume.template.document,
    samples,
    idempotencyKey: newId(),
  };
  const layer = Layer.merge(Layer.succeed(Actor, actor), Layer.succeed(Store, repository));
  const run = (input: WorkspaceScoreRequest, transport: typeof fetch) =>
    Effect.runPromise(
      scoreWorkspace(
        { ...env, ATS_SCREENER_ORIGIN: "https://ats.example.test" },
        input,
        transport,
      ).pipe(Effect.provide(layer)),
    );
  return { repository, actor, resume, input, run };
}
it("retains three exact fictional inputs, raw provider metadata and quota use, replaying without another request", async () => {
  const { repository, actor, input, run } = await fixture();
  const transport = vi.fn<typeof fetch>(async (_url, init) =>
    Response.json(
      init?.method === "POST"
        ? syntheticScoringResponse(JSON.parse(String(init.body)))
        : syntheticScoringVersion,
    ),
  );
  const result = await run(input, transport);
  expect(result.state).toBe("Complete");
  expect(JSON.parse(result.result ?? "{}").results).toHaveLength(3);
  expect(result.metadata).toContain("browser-fixture");
  expect(transport).toHaveBeenCalledTimes(4);
  expect((await run(input, transport)).id).toBe(result.id);
  expect(transport).toHaveBeenCalledTimes(4);
  expect(await repository.readScoringAllowance(actor)).toMatchObject({ used: 3, reserved: 0 });
  expect(await repository.listWorkspaceRecords(actor.ownerId, "fact")).toHaveLength(0);
});
it("rejects stale rendered text before a provider call and releases allowance after failure", async () => {
  const { repository, actor, input, run } = await fixture();
  if (input.kind !== "template-score") throw Error("fixture");
  const transport = vi.fn<typeof fetch>(async () => new Response("unavailable", { status: 503 }));
  await expect(
    run(
      { ...input, samples: input.samples.map((sample) => ({ ...sample, text: "lost text" })) },
      transport,
    ),
  ).rejects.toThrow();
  expect(transport).not.toHaveBeenCalled();
  const result = await run(input, transport);
  expect(result.state).toBe("Failed");
  expect(result.error).toContain("unavailable");
  expect(await repository.readScoringAllowance(actor)).toMatchObject({ used: 0, reserved: 0 });
});
it("scores an owned résumé against its captured posting with one quota unit", async () => {
  const { repository, actor, resume, run } = await fixture(),
    jobId = newId(),
    resumeId = newId();
  await repository.saveWorkspaceJob(actor, {
    id: jobId,
    revision: 0,
    idempotencyKey: newId(),
    details: { role: "Engineer", company: "Fictional", location: "Remote" },
    description: "Build accessible React products.",
    url: null,
    factIds: [],
    archived: false,
  });
  resume.job = { id: jobId, title: "Engineer", description: "Build accessible React products." };
  await repository.saveWorkspaceRecord(actor, {
    id: resumeId,
    revision: 0,
    idempotencyKey: newId(),
    payload: { kind: "resume", data: resume },
  });
  const transport = vi.fn<typeof fetch>(async (_url, init) =>
    Response.json(
      init?.method === "POST"
        ? syntheticScoringResponse(JSON.parse(String(init.body)))
        : syntheticScoringVersion,
    ),
  );
  const result = await run(
    {
      documentId: resumeId,
      kind: "resume-score",
      idempotencyKey: newId(),
      sample: {
        name: "Captured résumé",
        resume,
        text: resolveDocument(resume).expectedText.join("\n"),
        renderer: "browser-fixture",
        fonts: "fixture",
        mapped: true,
      },
    },
    transport,
  );
  expect(result.state).toBe("Complete");
  expect(JSON.parse(result.result ?? "{}").results).toHaveLength(1);
  expect(await repository.readScoringAllowance(actor)).toMatchObject({ used: 1, reserved: 0 });
  expect(result.input).toContain(resume.job.description);
});

import {
  AnswerClarificationRequest,
  ArchiveSourceRequest,
  BulkAddSourceEvidenceRequest,
  ClarificationList,
  RetrySourceAiRequest,
  ReviewSourceCandidateRequest,
  SourceAiIdentity,
  SourceAiList,
  StartSourceAiRequest,
} from "@river/contracts";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { Effect, Schema } from "effect";
import { bindings } from "./env";
import { Actor, attempt, dispatchPending, execute, Store } from "./services";
import {
  addSourceEvidence,
  inspectSourceAi,
  listSourceAi,
  previewSourceAi,
  retrySourceAi,
  reviewSourceCandidate,
  startSourceAi,
} from "./source-ai";
import { archiveSource } from "./sources";

export const addExtractedEvidence = createServerFn({ method: "POST" })
  .validator(Schema.decodeUnknownSync(BulkAddSourceEvidenceRequest))
  .handler(({ data }) => execute(bindings(), getRequestHeaders(), addSourceEvidence(data)));
export const trashSource = createServerFn({ method: "POST" })
  .validator(Schema.decodeUnknownSync(ArchiveSourceRequest))
  .handler(({ data }) =>
    execute(bindings(), getRequestHeaders(), archiveSource(data), "source:write"),
  );

export const getSourceAiTasks = createServerFn({ method: "GET" })
  .validator(Schema.decodeUnknownSync(SourceAiList))
  .handler(({ data }) =>
    execute(bindings(), getRequestHeaders(), listSourceAi(bindings(), data.sourceId, data.offset)),
  );
export const getSourceAiTask = createServerFn({ method: "GET" })
  .validator(Schema.decodeUnknownSync(SourceAiIdentity))
  .handler(({ data }) =>
    execute(bindings(), getRequestHeaders(), inspectSourceAi(bindings(), data.id)),
  );
export const generateSourceAiTask = createServerFn({ method: "POST" })
  .validator(Schema.decodeUnknownSync(StartSourceAiRequest))
  .handler(async ({ data }) => {
    const env = bindings();
    const result = await execute(env, getRequestHeaders(), startSourceAi(env, data));
    if (result.ok) await dispatchPending(env).catch(() => {});
    return result;
  });
export const retrySourceAiTask = createServerFn({ method: "POST" })
  .validator(Schema.decodeUnknownSync(RetrySourceAiRequest))
  .handler(async ({ data }) => {
    const env = bindings();
    const result = await execute(env, getRequestHeaders(), retrySourceAi(env, data));
    if (result.ok) await dispatchPending(env).catch(() => {});
    return result;
  });
export const decideSourceCandidate = createServerFn({ method: "POST" })
  .validator(Schema.decodeUnknownSync(ReviewSourceCandidateRequest))
  .handler(({ data }) => execute(bindings(), getRequestHeaders(), reviewSourceCandidate(data)));

export const getClarifications = createServerFn({ method: "GET" })
  .validator(Schema.decodeUnknownSync(ClarificationList))
  .handler(({ data }) =>
    execute(
      bindings(),
      getRequestHeaders(),
      Effect.gen(function* () {
        const actor = yield* Actor,
          store = yield* Store;
        return yield* attempt(() => store.listClarifications(actor.ownerId, data.claimId));
      }),
    ),
  );
export const resolveClarification = createServerFn({ method: "POST" })
  .validator(Schema.decodeUnknownSync(AnswerClarificationRequest))
  .handler(({ data }) =>
    execute(
      bindings(),
      getRequestHeaders(),
      Effect.gen(function* () {
        const actor = yield* Actor,
          store = yield* Store;
        return yield* attempt(() => store.answerClarification(actor, data));
      }),
    ),
  );

export const previewSourceAiInput = createServerFn({ method: "POST" })
  .validator(Schema.decodeUnknownSync(StartSourceAiRequest))
  .handler(({ data }) =>
    execute(bindings(), getRequestHeaders(), previewSourceAi(bindings(), data)),
  );

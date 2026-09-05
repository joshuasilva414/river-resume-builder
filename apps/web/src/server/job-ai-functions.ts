import {
  JobAiIdentity,
  JobAiList,
  RetryJobAiRequest,
  ReviewJobAiRequest,
  StartJobAiRequest,
} from "@river/contracts";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { Schema } from "effect";
import { bindings } from "./env";
import { inspectJobAi, listJobAi, retryJobAi, reviewJobAi, startJobAi } from "./job-ai";
import { dispatchPending, execute } from "./services";

export const getJobAiTasks = createServerFn({ method: "GET" })
  .validator(Schema.decodeUnknownSync(JobAiList))
  .handler(({ data }) =>
    execute(bindings(), getRequestHeaders(), listJobAi(bindings(), data.jobId, data.offset)),
  );
export const getJobAiTask = createServerFn({ method: "GET" })
  .validator(Schema.decodeUnknownSync(JobAiIdentity))
  .handler(({ data }) =>
    execute(bindings(), getRequestHeaders(), inspectJobAi(bindings(), data.id)),
  );
export const generateJobAi = createServerFn({ method: "POST" })
  .validator(Schema.decodeUnknownSync(StartJobAiRequest))
  .handler(async ({ data }) => {
    const env = bindings();
    const result = await execute(env, getRequestHeaders(), startJobAi(env, data));
    if (result.ok) await dispatchPending(env).catch(() => {});
    return result;
  });
export const retryJobAiTask = createServerFn({ method: "POST" })
  .validator(Schema.decodeUnknownSync(RetryJobAiRequest))
  .handler(async ({ data }) => {
    const env = bindings();
    const result = await execute(env, getRequestHeaders(), retryJobAi(env, data));
    if (result.ok) await dispatchPending(env).catch(() => {});
    return result;
  });
export const decideJobAi = createServerFn({ method: "POST" })
  .validator(Schema.decodeUnknownSync(ReviewJobAiRequest))
  .handler(({ data }) => execute(bindings(), getRequestHeaders(), reviewJobAi(data)));

import {
  DuplicateAiIdentity,
  DuplicateAiList,
  RetryDuplicateAiRequest,
  ReviewDuplicateAiRequest,
  StartDuplicateAiRequest,
} from "@river/contracts";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { Schema } from "effect";
import {
  inspectDuplicateAi,
  listDuplicateAi,
  previewDuplicateAi,
  retryDuplicateAi,
  reviewDuplicateAi,
  startDuplicateAi,
} from "./duplicate-ai";
import { bindings } from "./env";
import { dispatchPending, execute } from "./services";
export const getDuplicateAiTasks = createServerFn({ method: "GET" })
  .validator(Schema.decodeUnknownSync(DuplicateAiList))
  .handler(({ data }) =>
    execute(
      bindings(),
      getRequestHeaders(),
      listDuplicateAi(bindings(), data.claimId, data.offset),
    ),
  );
export const getDuplicateAiTask = createServerFn({ method: "GET" })
  .validator(Schema.decodeUnknownSync(DuplicateAiIdentity))
  .handler(({ data }) =>
    execute(bindings(), getRequestHeaders(), inspectDuplicateAi(bindings(), data.id)),
  );
export const previewDuplicateAiInput = createServerFn({ method: "POST" })
  .validator(Schema.decodeUnknownSync(StartDuplicateAiRequest))
  .handler(({ data }) => execute(bindings(), getRequestHeaders(), previewDuplicateAi(data)));
export const generateDuplicateAiTask = createServerFn({ method: "POST" })
  .validator(Schema.decodeUnknownSync(StartDuplicateAiRequest))
  .handler(async ({ data }) => {
    const env = bindings(),
      result = await execute(env, getRequestHeaders(), startDuplicateAi(env, data));
    if (result.ok) await dispatchPending(env).catch(() => {});
    return result;
  });
export const retryDuplicateAiTask = createServerFn({ method: "POST" })
  .validator(Schema.decodeUnknownSync(RetryDuplicateAiRequest))
  .handler(async ({ data }) => {
    const env = bindings(),
      result = await execute(env, getRequestHeaders(), retryDuplicateAi(env, data));
    if (result.ok) await dispatchPending(env).catch(() => {});
    return result;
  });
export const decideDuplicateAi = createServerFn({ method: "POST" })
  .validator(Schema.decodeUnknownSync(ReviewDuplicateAiRequest))
  .handler(({ data }) => execute(bindings(), getRequestHeaders(), reviewDuplicateAi(data)));

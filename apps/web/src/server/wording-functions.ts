import {
  RetryWordingRequest,
  ReviewWordingRequest,
  StartWordingRequest,
  WordingIdentity,
  WordingList,
} from "@river/contracts";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { Schema } from "effect";
import { bindings } from "./env";
import { dispatchPending, execute } from "./services";
import { inspectWording, listWording, retryWording, reviewWording, startWording } from "./wording";

export const getWordingTasks = createServerFn({ method: "GET" })
  .validator(Schema.decodeUnknownSync(WordingList))
  .handler(({ data }) =>
    execute(bindings(), getRequestHeaders(), listWording(bindings(), data.draftId, data.offset)),
  );
export const getWordingTask = createServerFn({ method: "GET" })
  .validator(Schema.decodeUnknownSync(WordingIdentity))
  .handler(({ data }) =>
    execute(bindings(), getRequestHeaders(), inspectWording(bindings(), data.id)),
  );
export const generateWordingTask = createServerFn({ method: "POST" })
  .validator(Schema.decodeUnknownSync(StartWordingRequest))
  .handler(async ({ data }) => {
    const env = bindings();
    const result = await execute(env, getRequestHeaders(), startWording(env, data));
    if (result.ok) await dispatchPending(env).catch(() => {});
    return result;
  });
export const retryWordingTask = createServerFn({ method: "POST" })
  .validator(Schema.decodeUnknownSync(RetryWordingRequest))
  .handler(async ({ data }) => {
    const env = bindings();
    const result = await execute(env, getRequestHeaders(), retryWording(env, data));
    if (result.ok) await dispatchPending(env).catch(() => {});
    return result;
  });
export const decideWording = createServerFn({ method: "POST" })
  .validator(Schema.decodeUnknownSync(ReviewWordingRequest))
  .handler(({ data }) => execute(bindings(), getRequestHeaders(), reviewWording(data)));

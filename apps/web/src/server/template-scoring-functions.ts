import {
  RetryTemplateScoringRequest,
  ScoringIdentityRequest,
  StartTemplateScoringRequest,
  TemplateScoringHistoryRequest,
} from "@river/contracts";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { Schema } from "effect";
import { bindings } from "./env";
import { dispatchPending, execute } from "./services";
import {
  inspectTemplateScoring,
  listTemplateScoring,
  retryTemplateScoring,
  startTemplateScoring,
} from "./template-scoring";

export const getTemplateScoringRuns = createServerFn({ method: "GET" })
  .validator(Schema.decodeUnknownSync(TemplateScoringHistoryRequest))
  .handler(({ data }) => {
    const env = bindings();
    return execute(env, getRequestHeaders(), listTemplateScoring(env, data));
  });
export const getTemplateScoringRun = createServerFn({ method: "GET" })
  .validator(Schema.decodeUnknownSync(ScoringIdentityRequest))
  .handler(({ data }) => execute(bindings(), getRequestHeaders(), inspectTemplateScoring(data.id)));
export const scoreTemplateFixtures = createServerFn({ method: "POST" })
  .validator(Schema.decodeUnknownSync(StartTemplateScoringRequest))
  .handler(async ({ data }) => {
    const env = bindings(),
      result = await execute(env, getRequestHeaders(), startTemplateScoring(env, data));
    if (result.ok) await dispatchPending(env).catch(() => {});
    return result;
  });
export const retryTemplateScoringRun = createServerFn({ method: "POST" })
  .validator(Schema.decodeUnknownSync(RetryTemplateScoringRequest))
  .handler(async ({ data }) => {
    const env = bindings(),
      result = await execute(env, getRequestHeaders(), retryTemplateScoring(env, data));
    if (result.ok) await dispatchPending(env).catch(() => {});
    return result;
  });

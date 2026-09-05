import {
  RetryTemplateAiRequest,
  ReviewTemplateAiRequest,
  StartTemplateAiRequest,
  TemplateAiIdentity,
  TemplateAiList,
} from "@river/contracts";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { Schema } from "effect";
import { bindings } from "./env";
import { dispatchPending, execute } from "./services";
import {
  inspectTemplateAi,
  listTemplateAi,
  previewTemplateAi,
  retryTemplateAi,
  reviewTemplateAi,
  startTemplateAi,
} from "./template-ai";
import { cleanRejectedTemplatePreviews } from "./template-ai-cleanup";

export const getTemplateAiTasks = createServerFn({ method: "GET" })
  .validator(Schema.decodeUnknownSync(TemplateAiList))
  .handler(({ data }) =>
    execute(bindings(), getRequestHeaders(), listTemplateAi(bindings(), data)),
  );
export const getTemplateAiTask = createServerFn({ method: "GET" })
  .validator(Schema.decodeUnknownSync(TemplateAiIdentity))
  .handler(({ data }) =>
    execute(bindings(), getRequestHeaders(), inspectTemplateAi(bindings(), data.id)),
  );
export const previewTemplateAiInput = createServerFn({ method: "POST" })
  .validator(Schema.decodeUnknownSync(StartTemplateAiRequest))
  .handler(({ data }) => execute(bindings(), getRequestHeaders(), previewTemplateAi(data)));
export const generateTemplateAiTask = createServerFn({ method: "POST" })
  .validator(Schema.decodeUnknownSync(StartTemplateAiRequest))
  .handler(async ({ data }) => {
    const env = bindings(),
      result = await execute(env, getRequestHeaders(), startTemplateAi(env, data));
    if (result.ok) await dispatchPending(env).catch(() => {});
    return result;
  });
export const retryTemplateAiTask = createServerFn({ method: "POST" })
  .validator(Schema.decodeUnknownSync(RetryTemplateAiRequest))
  .handler(async ({ data }) => {
    const env = bindings(),
      result = await execute(env, getRequestHeaders(), retryTemplateAi(env, data));
    if (result.ok) await dispatchPending(env).catch(() => {});
    return result;
  });
export const decideTemplateAi = createServerFn({ method: "POST" })
  .validator(Schema.decodeUnknownSync(ReviewTemplateAiRequest))
  .handler(async ({ data }) => {
    const env = bindings(),
      result = await execute(env, getRequestHeaders(), reviewTemplateAi(data));
    if (result.ok && data.decision === "Rejected")
      await cleanRejectedTemplatePreviews(env).catch(() => {});
    return result;
  });

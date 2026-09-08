import {
  ApproveTemplateRequest,
  MixTemplateRequest,
  PreviewWorkingTemplateRequest,
  RetireTemplateRequest,
  SaveTemplateRequest,
  StartTemplateValidationRequest,
  TemplateIdentity,
  TemplateSearch,
} from "@river/contracts";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { Effect, Schema } from "effect";
import { bindings } from "./env";
import { Actor, attempt, dispatchPending, execute, Store } from "./services";
import {
  approveTemplate,
  inspectTemplate,
  inspectTemplateValidation,
  listTemplates,
  mixTemplate,
  retireTemplate,
  saveTemplate,
  validateTemplate,
} from "./templates";

export const getTemplates = createServerFn({ method: "GET" })
  .validator(Schema.decodeUnknownSync(TemplateSearch))
  .handler(({ data }) => execute(bindings(), getRequestHeaders(), listTemplates(data)));
export const previewWorkingTemplate = createServerFn({ method: "POST" })
  .validator(Schema.decodeUnknownSync(PreviewWorkingTemplateRequest))
  .handler(async ({ data }) => {
    const env = bindings();
    const result = await execute(
      env,
      getRequestHeaders(),
      Effect.gen(function* () {
        const actor = yield* Actor,
          store = yield* Store;
        return yield* attempt(() => store.previewWorkingTemplate(actor, data));
      }),
    );
    if (result.ok) await dispatchPending(env).catch(() => {});
    return result;
  });
export const getTemplate = createServerFn({ method: "GET" })
  .validator(Schema.decodeUnknownSync(TemplateIdentity))
  .handler(({ data }) =>
    execute(bindings(), getRequestHeaders(), inspectTemplate(bindings(), data.revisionId)),
  );
export const getTemplateValidation = createServerFn({ method: "GET" })
  .validator(Schema.decodeUnknownSync(Schema.Struct({ id: TemplateIdentity.fields.revisionId })))
  .handler(({ data }) =>
    execute(bindings(), getRequestHeaders(), inspectTemplateValidation(data.id)),
  );
export const saveTemplateDraft = createServerFn({ method: "POST" })
  .validator(Schema.decodeUnknownSync(SaveTemplateRequest))
  .handler(({ data }) => execute(bindings(), getRequestHeaders(), saveTemplate(data)));
export const mixTemplateGraph = createServerFn({ method: "POST" })
  .validator(Schema.decodeUnknownSync(MixTemplateRequest))
  .handler(({ data }) => execute(bindings(), getRequestHeaders(), mixTemplate(data)));
export const validateTemplateDraft = createServerFn({ method: "POST" })
  .validator(Schema.decodeUnknownSync(StartTemplateValidationRequest))
  .handler(async ({ data }) => {
    const env = bindings(),
      result = await execute(env, getRequestHeaders(), validateTemplate(env, data));
    if (result.ok) await dispatchPending(env).catch(() => {});
    return result;
  });
export const approveTemplateRevision = createServerFn({ method: "POST" })
  .validator(Schema.decodeUnknownSync(ApproveTemplateRequest))
  .handler(({ data }) => execute(bindings(), getRequestHeaders(), approveTemplate(data)));
export const retireTemplateRevision = createServerFn({ method: "POST" })
  .validator(Schema.decodeUnknownSync(RetireTemplateRequest))
  .handler(({ data }) => execute(bindings(), getRequestHeaders(), retireTemplate(data)));

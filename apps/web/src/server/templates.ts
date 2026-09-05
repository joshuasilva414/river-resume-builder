import type {
  ApproveTemplateRequest,
  MixTemplateRequest,
  RetireTemplateRequest,
  SaveTemplateRequest,
  StartTemplateValidationRequest,
  TemplateSearch,
} from "@river/contracts";
import { Effect } from "effect";
import type { Env } from "./env";
import { Actor, attempt, Store } from "./services";

export const saveTemplate = (input: SaveTemplateRequest) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    return yield* attempt(() => store.saveTemplate(actor, input));
  });
export const mixTemplate = (input: MixTemplateRequest) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    return yield* attempt(() => store.mixTemplate(actor, input));
  });
export const listTemplates = (input: TemplateSearch) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    return yield* attempt(() => store.listTemplates(actor.ownerId, input));
  });
export const inspectTemplate = (env: Env, id: string) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    const detail = yield* attempt(() => store.inspectTemplate(actor.ownerId, id));
    return { ...detail, validationConfigured: Boolean(env.TEMPLATE_VALIDATION_WORKFLOW) };
  });
export const inspectTemplateValidation = (id: string) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    return yield* attempt(() => store.inspectTemplateValidation(actor.ownerId, id));
  });
export const validateTemplate = (env: Env, input: StartTemplateValidationRequest) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    return yield* attempt(() =>
      store.startTemplateValidation(actor, input, Boolean(env.TEMPLATE_VALIDATION_WORKFLOW)),
    );
  });
export const approveTemplate = (input: ApproveTemplateRequest) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    return yield* attempt(() => store.approveTemplate(actor, input));
  });
export const retireTemplate = (input: RetireTemplateRequest) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    return yield* attempt(() => store.retireTemplate(actor, input));
  });

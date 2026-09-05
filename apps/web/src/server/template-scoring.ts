import type {
  RetryTemplateScoringRequest,
  StartTemplateScoringRequest,
  TemplateScoringHistoryRequest,
} from "@river/contracts";
import { ApplicationError, scoringProfile } from "@river/domain";
import { ATS_QUALIFICATION_POLICY, captureAtsFixtureSet } from "@river/templates";
import { Effect } from "effect";
import type { Env } from "./env";
import { Actor, attempt, Store } from "./services";

export const startTemplateScoring = (env: Env, input: StartTemplateScoringRequest) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    if (actor.kind !== "owner")
      return yield* Effect.fail(
        new ApplicationError({ code: "Forbidden", message: "Only the Owner can score templates." }),
      );
    const replay = yield* attempt(() =>
      store.replayCommand(actor.id, "start-template-scoring", input.idempotencyKey, input),
    );
    if (replay) return replay;
    if (!env.TEMPLATE_SCORING_WORKFLOW || !env.ATS_SCREENER_ORIGIN)
      return yield* Effect.fail(
        new ApplicationError({
          code: "Unavailable",
          message: "Template scoring is unavailable. Local validation and export remain available.",
        }),
      );
    return yield* attempt(() =>
      store.startTemplateScoring(actor, input, scoringProfile(env.ATS_SCREENER_ORIGIN ?? "")),
    );
  });
export const retryTemplateScoring = (env: Env, input: RetryTemplateScoringRequest) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    if (actor.kind !== "owner")
      return yield* Effect.fail(
        new ApplicationError({ code: "Forbidden", message: "Only the Owner can score templates." }),
      );
    const replay = yield* attempt(() =>
      store.replayCommand(actor.id, "retry-template-scoring", input.idempotencyKey, input),
    );
    if (replay) return replay;
    if (!env.TEMPLATE_SCORING_WORKFLOW)
      return yield* Effect.fail(
        new ApplicationError({
          code: "Unavailable",
          message: "The template scoring runtime is unavailable.",
        }),
      );
    return yield* attempt(() => store.retryTemplateScoring(actor, input));
  });
export const inspectTemplateScoring = (id: string) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    return yield* attempt(() => store.inspectTemplateScoring(actor, id));
  });
export const listTemplateScoring = (env: Env, input: TemplateScoringHistoryRequest) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    const history = yield* attempt(() => store.listTemplateScoring(actor, input)),
      fixtures = yield* attempt(captureAtsFixtureSet);
    return {
      ...history,
      configured: Boolean(env.TEMPLATE_SCORING_WORKFLOW && env.ATS_SCREENER_ORIGIN),
      runtimeConfigured: Boolean(env.TEMPLATE_SCORING_WORKFLOW),
      fixtureSet: {
        version: fixtures.version,
        digest: fixtures.digest,
        fixtures: fixtures.fixtures.map((f) => ({ id: f.id, name: f.name })),
      },
      policy: ATS_QUALIFICATION_POLICY,
    };
  });

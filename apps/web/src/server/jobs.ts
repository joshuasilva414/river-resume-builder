import type { InspectJobRequest, JobCommand, JobSearch } from "@river/contracts";
import { ApplicationError } from "@river/domain";
import { Effect } from "effect";
import { Actor, attempt, Store } from "./services";

export const runJobCommand = (input: JobCommand) =>
  Effect.gen(function* () {
    const actor = yield* Actor;
    const store = yield* Store;
    if (actor.kind === "agent" && !actor.scopes.includes("jobs:write"))
      return yield* Effect.fail(
        new ApplicationError({
          code: "Forbidden",
          message: "This credential does not allow job changes.",
        }),
      );
    return yield* attempt(() => store.runJobCommand(actor, input));
  });
export const searchJobs = (input: JobSearch) =>
  Effect.gen(function* () {
    const actor = yield* Actor;
    const store = yield* Store;
    const result = yield* attempt(() => store.listJobs(actor.ownerId, input));
    return { ...result, items: result.items.map(({ ownerId: _owner, ...job }) => job) };
  });
export const inspectJob = (input: InspectJobRequest) =>
  Effect.gen(function* () {
    const actor = yield* Actor;
    const store = yield* Store;
    const result = yield* attempt(() => store.inspectJob(actor.ownerId, input));
    const { ownerId: _owner, ...job } = result.job;
    return { ...result, job };
  });

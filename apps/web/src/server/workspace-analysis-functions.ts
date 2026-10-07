import { identitySchema } from "@river/domain/workspace";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { Effect } from "effect";
import { z } from "zod";
import { bindings } from "./env";
import { Actor, attempt, execute, Store } from "./services";
import { scoreWorkspace, workspaceScoreSchema } from "./workspace-scoring";
import { proposeWorkspaceSuggestions, suggestionRequestSchema } from "./workspace-suggestions";
export const requestWorkspaceSuggestions = createServerFn({ method: "POST" })
  .validator((input: unknown) => suggestionRequestSchema.parse(input))
  .handler(({ data }) =>
    execute(bindings(), getRequestHeaders(), proposeWorkspaceSuggestions(bindings(), data)),
  );
export const requestWorkspaceScore = createServerFn({ method: "POST" })
  .validator((input: unknown) => workspaceScoreSchema.parse(input))
  .handler(({ data }) =>
    execute(bindings(), getRequestHeaders(), scoreWorkspace(bindings(), data)),
  );
export const getWorkspaceAnalyses = createServerFn({ method: "GET" })
  .validator((input: unknown) => identitySchema.parse(input))
  .handler(({ data }) =>
    execute(
      bindings(),
      getRequestHeaders(),
      Effect.gen(function* () {
        const actor = yield* Actor,
          store = yield* Store;
        yield* attempt(() => store.getWorkspaceRecord(actor.ownerId, data));
        return yield* attempt(() => store.listWorkspaceRuns(actor.ownerId, data));
      }),
    ),
  );
export const getWorkspaceJobs = createServerFn({ method: "GET" })
  .validator((input: unknown) => z.string().max(200).parse(input))
  .handler(({ data }) =>
    execute(
      bindings(),
      getRequestHeaders(),
      Effect.gen(function* () {
        const actor = yield* Actor,
          store = yield* Store;
        return yield* attempt(() => store.listWorkspaceJobs(actor.ownerId, data));
      }),
      "jobs:read",
    ),
  );
export const getWorkspaceJob = createServerFn({ method: "GET" })
  .validator((input: unknown) => identitySchema.parse(input))
  .handler(({ data }) =>
    execute(
      bindings(),
      getRequestHeaders(),
      Effect.gen(function* () {
        const actor = yield* Actor,
          store = yield* Store;
        return yield* attempt(() => store.getWorkspaceJob(actor.ownerId, data));
      }),
      "jobs:read",
    ),
  );
export const getWorkspaceScoringAllowance = createServerFn({ method: "GET" }).handler(() =>
  execute(
    bindings(),
    getRequestHeaders(),
    Effect.gen(function* () {
      const actor = yield* Actor,
        store = yield* Store;
      return yield* attempt(() => store.readScoringAllowance(actor));
    }),
  ),
);

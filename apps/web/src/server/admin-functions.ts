import {
  AdminDashboardRequest,
  ResetScoringAllowanceRequest,
  SetScoringLimitRequest,
} from "@river/contracts";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { Effect, Schema } from "effect";
import { isAdministrator } from "./account-access";
import { bindings } from "./env";
import { Actor, attempt, execute, Store } from "./services";

export const getAdminDashboard = createServerFn({ method: "GET" })
  .validator(Schema.decodeUnknownSync(AdminDashboardRequest))
  .handler(({ data }) => {
    const env = bindings();
    return execute(
      env,
      getRequestHeaders(),
      Effect.gen(function* () {
        const actor = yield* Actor,
          store = yield* Store;
        const result = yield* attempt(() => store.adminDashboard(actor, data));
        return {
          ...result,
          accounts: result.accounts.map((account) => ({
            ...account,
            administrator: isAdministrator(env, account.email),
          })),
        };
      }),
    );
  });
export const setScoringLimit = createServerFn({ method: "POST" })
  .validator(Schema.decodeUnknownSync(SetScoringLimitRequest))
  .handler(({ data }) =>
    execute(
      bindings(),
      getRequestHeaders(),
      Effect.gen(function* () {
        const actor = yield* Actor,
          store = yield* Store;
        return yield* attempt(() => store.setScoringLimit(actor, data));
      }),
    ),
  );
export const resetScoringAllowance = createServerFn({ method: "POST" })
  .validator(Schema.decodeUnknownSync(ResetScoringAllowanceRequest))
  .handler(({ data }) =>
    execute(
      bindings(),
      getRequestHeaders(),
      Effect.gen(function* () {
        const actor = yield* Actor,
          store = yield* Store;
        return yield* attempt(() => store.resetScoringAllowance(actor, data));
      }),
    ),
  );

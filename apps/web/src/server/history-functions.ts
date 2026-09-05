import { CheckpointIdentity, HistorySelection } from "@river/contracts";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { Effect, Schema } from "effect";
import { bindings } from "./env";
import { Actor, attempt, execute, Store } from "./services";

export const getHistorySnapshot = createServerFn({ method: "GET" })
  .validator(Schema.decodeUnknownSync(HistorySelection))
  .handler(({ data }) =>
    execute(
      bindings(),
      getRequestHeaders(),
      Effect.gen(function* () {
        const actor = yield* Actor,
          store = yield* Store;
        return yield* attempt(() => store.historySnapshot(actor, data));
      }),
    ),
  );
export const getHistoryDraftHead = createServerFn({ method: "GET" })
  .validator(Schema.decodeUnknownSync(CheckpointIdentity))
  .handler(({ data }) =>
    execute(
      bindings(),
      getRequestHeaders(),
      Effect.gen(function* () {
        const actor = yield* Actor,
          store = yield* Store;
        return yield* attempt(() => store.historyDraftHead(actor, data.id));
      }),
    ),
  );

import { SetTrashRequest, TrashSearch } from "@river/contracts";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { Effect, Schema } from "effect";
import { bindings } from "./env";
import { Actor, attempt, execute, Store } from "./services";

export const getTrash = createServerFn({ method: "GET" })
  .validator(Schema.decodeUnknownSync(TrashSearch))
  .handler(({ data }) =>
    execute(
      bindings(),
      getRequestHeaders(),
      Effect.gen(function* () {
        const actor = yield* Actor;
        const store = yield* Store;
        return yield* attempt(() => store.listTrash(actor.ownerId, data));
      }),
    ),
  );

export const setTrashItem = createServerFn({ method: "POST" })
  .validator(Schema.decodeUnknownSync(SetTrashRequest))
  .handler(({ data }) =>
    execute(
      bindings(),
      getRequestHeaders(),
      Effect.gen(function* () {
        const actor = yield* Actor;
        const store = yield* Store;
        return yield* attempt(() => store.setTrash(actor, data));
      }),
    ),
  );

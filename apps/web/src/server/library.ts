import type {
  InspectLibraryRequest,
  LibrarySearch,
  SaveLibraryRequest,
  SetLibraryArchivedRequest,
} from "@river/contracts";
import { ApplicationError } from "@river/domain";
import { Effect } from "effect";
import { Actor, attempt, Store } from "./services";
export const searchLibrary = (input: LibrarySearch) =>
  Effect.gen(function* () {
    const actor = yield* Actor;
    const store = yield* Store;
    return yield* attempt(() => store.listLibrary(actor.ownerId, input));
  });
export const inspectLibrary = (input: InspectLibraryRequest) =>
  Effect.gen(function* () {
    const actor = yield* Actor;
    const store = yield* Store;
    return yield* attempt(() => store.inspectLibrary(actor.ownerId, input));
  });
export const saveLibrary = (input: SaveLibraryRequest) =>
  Effect.gen(function* () {
    const actor = yield* Actor;
    const store = yield* Store;
    if (actor.kind !== "owner")
      return yield* Effect.fail(
        new ApplicationError({
          code: "Forbidden",
          message: "Only the Owner can change reusable content.",
        }),
      );
    return yield* attempt(() => store.saveLibrary(actor, input));
  });
export const setLibraryArchived = (input: SetLibraryArchivedRequest) =>
  Effect.gen(function* () {
    const actor = yield* Actor;
    const store = yield* Store;
    return yield* attempt(() => store.setLibraryArchived(actor, input));
  });

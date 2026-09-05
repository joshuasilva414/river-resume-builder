import type {
  ApplyLibraryRequest,
  BranchResumeRequest,
  CopyPlacementRequest,
  CreateResumeRequest,
  PreviewResumeRequest,
  ResumeSearch,
  SaveResumeRequest,
} from "@river/contracts";
import { Effect } from "effect";
import { Actor, attempt, Store } from "./services";
export const searchResumes = (input: ResumeSearch) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    return yield* attempt(() => store.listResumes(actor.ownerId, input));
  });
export const inspectResume = (id: string) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    return yield* attempt(() => store.inspectResume(actor.ownerId, id));
  });
export const createResume = (input: CreateResumeRequest) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    return yield* attempt(() => store.createResume(actor, input));
  });
export const saveResume = (input: SaveResumeRequest) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    return yield* attempt(() => store.saveResume(actor, input));
  });
export const branchResume = (input: BranchResumeRequest) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    return yield* attempt(() => store.branchResume(actor, input));
  });
export const copyPlacement = (input: CopyPlacementRequest) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    return yield* attempt(() => store.copyPlacement(actor, input));
  });
export const previewResume = (input: PreviewResumeRequest) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    const result = yield* attempt(() => store.previewResume(actor, input));
    yield* attempt(() => store.publishResumePreview(result.id));
    return result;
  });

export const applyLibraryUpdate = (input: ApplyLibraryRequest) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    return yield* attempt(() => store.applyLibraryUpdate(actor, input));
  });

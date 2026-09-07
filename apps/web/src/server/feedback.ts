import type {
  FeedbackSearch,
  SubmitFeedbackRequest,
  UpdateFeedbackRequest,
} from "@river/contracts";
import { Effect } from "effect";
import { Actor, attempt, Store } from "./services";

export const readFeedback = (input: FeedbackSearch) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    return yield* attempt(() => store.listFeedback(actor, input));
  });
export const submitFeedback = (input: SubmitFeedbackRequest) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    return yield* attempt(() => store.submitFeedback(actor, input));
  });
export const updateFeedback = (input: UpdateFeedbackRequest) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    return yield* attempt(() => store.updateFeedback(actor, input));
  });

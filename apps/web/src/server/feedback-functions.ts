import { FeedbackSearch, SubmitFeedbackRequest, UpdateFeedbackRequest } from "@river/contracts";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { Schema } from "effect";
import { bindings } from "./env";
import { readFeedback, submitFeedback, updateFeedback } from "./feedback";
import { execute } from "./services";

export const getFeedback = createServerFn({ method: "GET" })
  .validator(Schema.decodeUnknownSync(FeedbackSearch))
  .handler(({ data }) => execute(bindings(), getRequestHeaders(), readFeedback(data)));
export const sendFeedback = createServerFn({ method: "POST" })
  .validator(Schema.decodeUnknownSync(SubmitFeedbackRequest))
  .handler(({ data }) => execute(bindings(), getRequestHeaders(), submitFeedback(data)));
export const saveFeedbackUpdate = createServerFn({ method: "POST" })
  .validator(Schema.decodeUnknownSync(UpdateFeedbackRequest))
  .handler(({ data }) => execute(bindings(), getRequestHeaders(), updateFeedback(data)));

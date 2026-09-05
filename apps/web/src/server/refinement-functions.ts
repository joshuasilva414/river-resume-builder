import {
  RetrySourceRefinementRequest,
  ReturnToStructuredRequest,
  ReviewSourceRefinementRequest,
  SourceRefinementIdentity,
  SourceRefinementList,
  StartSourceRefinementRequest,
} from "@river/contracts";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { Schema } from "effect";
import { bindings } from "./env";
import {
  inspectSourceRefinement,
  inspectStructuredReturn,
  listSourceRefinements,
  retrySourceRefinement,
  returnToStructured,
  reviewSourceRefinement,
  startSourceRefinement,
} from "./refinement";
import { cleanRejectedSourceRefinements } from "./refinement-cleanup";
import { dispatchPending, execute } from "./services";

export const getStructuredReturn = createServerFn({ method: "GET" })
  .validator(Schema.decodeUnknownSync(SourceRefinementIdentity))
  .handler(({ data }) =>
    execute(bindings(), getRequestHeaders(), inspectStructuredReturn(bindings(), data.id)),
  );
export const createStructuredBranch = createServerFn({ method: "POST" })
  .validator(Schema.decodeUnknownSync(ReturnToStructuredRequest))
  .handler(({ data }) => execute(bindings(), getRequestHeaders(), returnToStructured(data)));

export const getSourceRefinement = createServerFn({ method: "GET" })
  .validator(Schema.decodeUnknownSync(SourceRefinementIdentity))
  .handler(({ data }) =>
    execute(bindings(), getRequestHeaders(), inspectSourceRefinement(bindings(), data.id)),
  );
export const getSourceRefinements = createServerFn({ method: "GET" })
  .validator(Schema.decodeUnknownSync(SourceRefinementList))
  .handler(({ data }) =>
    execute(bindings(), getRequestHeaders(), listSourceRefinements(bindings(), data)),
  );
export const generateSourceRefinementTask = createServerFn({ method: "POST" })
  .validator(Schema.decodeUnknownSync(StartSourceRefinementRequest))
  .handler(async ({ data }) => {
    const env = bindings(),
      result = await execute(env, getRequestHeaders(), startSourceRefinement(env, data));
    if (result.ok) await dispatchPending(env).catch(() => {});
    return result;
  });
export const retrySourceRefinementTask = createServerFn({ method: "POST" })
  .validator(Schema.decodeUnknownSync(RetrySourceRefinementRequest))
  .handler(async ({ data }) => {
    const env = bindings(),
      result = await execute(env, getRequestHeaders(), retrySourceRefinement(env, data));
    if (result.ok) await dispatchPending(env).catch(() => {});
    return result;
  });
export const decideSourceRefinement = createServerFn({ method: "POST" })
  .validator(Schema.decodeUnknownSync(ReviewSourceRefinementRequest))
  .handler(async ({ data }) => {
    const env = bindings(),
      result = await execute(env, getRequestHeaders(), reviewSourceRefinement(env, data));
    if (result.ok) {
      if (data.decision === "Rejected") await cleanRejectedSourceRefinements(env).catch(() => {});
      else await dispatchPending(env).catch(() => {});
    }
    return result;
  });

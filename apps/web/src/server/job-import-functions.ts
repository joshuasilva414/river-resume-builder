import { JobImportIdentity, RetryJobImportRequest, StartJobImportRequest } from "@river/contracts";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { Schema } from "effect";
import { bindings } from "./env";
import { inspectJobImport, retryJobImport, startJobImport } from "./job-import";
import { dispatchPending, execute } from "./services";

export const getJobImport = createServerFn({ method: "GET" })
  .validator(Schema.decodeUnknownSync(JobImportIdentity))
  .handler(({ data }) => execute(bindings(), getRequestHeaders(), inspectJobImport(data.id)));
export const importJob = createServerFn({ method: "POST" })
  .validator(Schema.decodeUnknownSync(StartJobImportRequest))
  .handler(async ({ data }) => {
    const env = bindings(),
      result = await execute(env, getRequestHeaders(), startJobImport(env, data));
    if (result.ok) await dispatchPending(env).catch(() => {});
    return result;
  });
export const retryImportJob = createServerFn({ method: "POST" })
  .validator(Schema.decodeUnknownSync(RetryJobImportRequest))
  .handler(async ({ data }) => {
    const env = bindings(),
      result = await execute(env, getRequestHeaders(), retryJobImport(env, data));
    if (result.ok) await dispatchPending(env).catch(() => {});
    return result;
  });

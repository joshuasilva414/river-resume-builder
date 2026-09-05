import { InspectJobRequest, JobCommand, JobSearch } from "@river/contracts";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { Schema } from "effect";
import { bindings } from "./env";
import { inspectJob, runJobCommand, searchJobs } from "./jobs";
import { execute } from "./services";
export const getJobs = createServerFn({ method: "GET" })
  .validator(Schema.decodeUnknownSync(JobSearch))
  .handler(({ data }) => execute(bindings(), getRequestHeaders(), searchJobs(data), "jobs:read"));
export const getJobDetail = createServerFn({ method: "GET" })
  .validator(Schema.decodeUnknownSync(InspectJobRequest))
  .handler(({ data }) => execute(bindings(), getRequestHeaders(), inspectJob(data), "jobs:read"));
export const mutateJob = createServerFn({ method: "POST" })
  .validator(Schema.decodeUnknownSync(JobCommand))
  .handler(({ data }) =>
    execute(bindings(), getRequestHeaders(), runJobCommand(data), "jobs:write"),
  );

import { jobTargetInputSchema } from "@river/domain/workspace";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { z } from "zod";
import { bindings } from "./env";
import { execute } from "./services";
import { saveJobTarget, searchWorkspaceJobs } from "./workspace-job-commands";
export const listJobTargets = createServerFn({ method: "GET" })
  .validator((input: unknown) =>
    z.object({ query: z.string().max(200), archived: z.boolean() }).parse(input),
  )
  .handler(({ data }) =>
    execute(
      bindings(),
      getRequestHeaders(),
      searchWorkspaceJobs(data.query, data.archived),
      "jobs:read",
    ),
  );
export const saveWorkspaceJob = createServerFn({ method: "POST" })
  .validator((input: unknown) => jobTargetInputSchema.parse(input))
  .handler(({ data }) =>
    execute(bindings(), getRequestHeaders(), saveJobTarget(data), "jobs:write"),
  );

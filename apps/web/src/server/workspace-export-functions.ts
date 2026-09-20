import { identitySchema } from "@river/domain/workspace";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { bindings } from "./env";
import { execute } from "./services";
import { workspaceExportHistory } from "./workspace-exports";
export const getWorkspaceExports = createServerFn({ method: "GET" })
  .validator((input: unknown) => identitySchema.parse(input))
  .handler(({ data }) =>
    execute(bindings(), getRequestHeaders(), workspaceExportHistory(data), "resumes:read"),
  );

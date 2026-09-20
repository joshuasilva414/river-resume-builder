import { extractedSourceSchema } from "@river/domain/workspace";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { bindings } from "./env";
import { execute } from "./services";
import { storeExtractedSource } from "./workspace-source-storage";
export const submitExtractedSource = createServerFn({ method: "POST" })
  .validator((input: unknown) => extractedSourceSchema.parse(input))
  .handler(({ data }) =>
    execute(
      bindings(),
      getRequestHeaders(),
      storeExtractedSource(bindings(), data),
      "source:write",
    ),
  );

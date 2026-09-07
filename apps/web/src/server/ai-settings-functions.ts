import {
  AiConnectionRequest,
  RemoveAiConnectionRequest,
  SaveAiConnectionRequest,
  SaveWorkspacePreferencesRequest,
} from "@river/contracts";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { Schema } from "effect";
import {
  readAiModels,
  readAiSettings,
  readOnboardingProgress,
  removeAiConnection,
  saveAiConnection,
  saveWorkspacePreferences,
} from "./ai-settings";
import { bindings } from "./env";
import { execute } from "./services";

export const getAiSettings = createServerFn({ method: "GET" }).handler(() =>
  execute(bindings(), getRequestHeaders(), readAiSettings(bindings())),
);
export const getOnboardingProgress = createServerFn({ method: "GET" }).handler(() =>
  execute(bindings(), getRequestHeaders(), readOnboardingProgress),
);
export const getAiModels = createServerFn({ method: "GET" })
  .validator(Schema.decodeUnknownSync(AiConnectionRequest))
  .handler(({ data }) =>
    execute(bindings(), getRequestHeaders(), readAiModels(bindings(), data.id)),
  );
export const connectAiProvider = createServerFn({ method: "POST" })
  .validator(Schema.decodeUnknownSync(SaveAiConnectionRequest))
  .handler(({ data }) =>
    execute(bindings(), getRequestHeaders(), saveAiConnection(bindings(), data)),
  );
export const disconnectAiProvider = createServerFn({ method: "POST" })
  .validator(Schema.decodeUnknownSync(RemoveAiConnectionRequest))
  .handler(({ data }) => execute(bindings(), getRequestHeaders(), removeAiConnection(data)));
export const updateWorkspacePreferences = createServerFn({ method: "POST" })
  .validator(Schema.decodeUnknownSync(SaveWorkspacePreferencesRequest))
  .handler(({ data }) => execute(bindings(), getRequestHeaders(), saveWorkspacePreferences(data)));

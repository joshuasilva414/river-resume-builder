import { Schema } from "effect";
import { Revision } from "./core";
import { RecordId } from "./evidence";

export const aiProviders = ["openai", "anthropic", "google", "openrouter"] as const;
export const AiProvider = Schema.Literals(aiProviders);
export type AiProvider = typeof AiProvider.Type;
export const aiProviderLabels = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google Gemini",
  openrouter: "OpenRouter",
} as const satisfies Record<AiProvider, string>;
export const AiModel = Schema.NonEmptyString.check(Schema.isMaxLength(200));
export const AiSelection = Schema.Struct({ connectionId: RecordId, model: AiModel });
export type AiSelection = typeof AiSelection.Type;
/** Public execution identity. Credentials never enter a captured task. */
export const AiConnectionBinding = Schema.Struct({
  id: RecordId,
  revision: Revision,
  provider: AiProvider,
});
export type AiConnectionBinding = typeof AiConnectionBinding.Type;
export const AiExecutionFields = { connection: Schema.optionalKey(AiConnectionBinding) };
export type AiModelConfiguration = {
  readonly model: string;
  readonly connection: AiConnectionBinding;
};
export const WorkspacePreferences = Schema.Struct({
  advancedTools: Schema.Boolean,
  onboardingDismissed: Schema.Boolean,
  defaultAi: Schema.NullOr(AiSelection),
});
export type WorkspacePreferences = typeof WorkspacePreferences.Type;
export const defaultWorkspacePreferences: WorkspacePreferences = {
  advancedTools: false,
  onboardingDismissed: false,
  defaultAi: null,
};

export type AiExecutionMetadata = {
  readonly connection: AiConnectionBinding;
  readonly requestedModel: string;
  readonly returnedModel: string;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
};

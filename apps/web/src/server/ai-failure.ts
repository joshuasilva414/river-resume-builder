import { ApplicationError } from "@river/domain";
import { APICallError, NoObjectGeneratedError, NoOutputGeneratedError } from "ai";

const messages = {
  authorization:
    "Your provider could not authorize this model. Check the connection in Settings or choose another model for a new task.",
  rate_limit:
    "Your AI provider reached its usage limit. Check your provider balance or wait before retrying.",
  request_rejected:
    "Your provider rejected the request for this model. Choose another model for a new task or contact support.",
  provider_unavailable:
    "Your AI provider is temporarily unavailable. Wait before retrying this task.",
  timeout: "The AI request timed out. Retry this task or choose another model for a new task.",
  invalid_output:
    "The selected model did not return a complete valid response. No changes were applied. Retry this task or choose another model for a new task.",
  request_failed:
    "The AI request could not be completed. Retry this task or choose another model for a new task.",
};

export type AiFailureDiagnostic = {
  category: keyof typeof messages;
  httpStatus: number | null;
};

/** Contains only fixed messages and bounded metadata, never the original provider error. */
export class AiProviderFailure extends ApplicationError {
  constructor(readonly diagnostic: AiFailureDiagnostic) {
    super({ code: "Unavailable", message: messages[diagnostic.category] });
  }
}

export function classifyAiFailure(error: unknown): AiProviderFailure {
  if (error instanceof AiProviderFailure) return error;
  if (APICallError.isInstance(error)) {
    const status = error.statusCode;
    const httpStatus =
      status !== undefined && Number.isInteger(status) && status >= 100 && status <= 599
        ? status
        : null;
    const category =
      httpStatus === 401 || httpStatus === 403
        ? "authorization"
        : httpStatus === 429
          ? "rate_limit"
          : httpStatus !== null && httpStatus >= 500
            ? "provider_unavailable"
            : httpStatus !== null && httpStatus >= 400
              ? "request_rejected"
              : "request_failed";
    return new AiProviderFailure({ category, httpStatus });
  }
  const category =
    error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")
      ? "timeout"
      : NoObjectGeneratedError.isInstance(error) || NoOutputGeneratedError.isInstance(error)
        ? "invalid_output"
        : "request_failed";
  return new AiProviderFailure({ category, httpStatus: null });
}

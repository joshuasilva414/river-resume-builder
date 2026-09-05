import { createRepository, type ScoringFailure } from "@river/db";
import { ApplicationError } from "@river/domain";
import type { Env } from "./env";
import { readScoringText } from "./scoring-artifacts";
import {
  inspectScoringProvider,
  ScoringProviderError,
  scoreCheckpointText,
} from "./scoring-provider";

type ScoringEnvironment = Pick<Env, "DB" | "ARTIFACTS">;
export function scoringFailure(error: unknown): ScoringFailure {
  if (error instanceof ScoringProviderError)
    return { code: error.code, message: error.message, retryAt: error.retryAt };
  if (error instanceof ApplicationError)
    return { code: "InvalidInput", message: error.message, retryAt: null };
  return {
    code: "Interrupted",
    message:
      "Scoring stopped before publication. Any retained response is preserved for recovery; review this attempt before retrying.",
    retryAt: null,
  };
}

/** Return only stage names to Workflow history; exact inputs remain in application storage. */
export async function prepareScoring(env: ScoringEnvironment, id: string) {
  const store = createRepository(env.DB);
  await store.updateOperation(id, { state: "Running", stage: "Preparing exact checkpoint text" });
  const document = await store.scoringDocument(id);
  if (document.state !== "Ready") return document.state;
  const verified = await readScoringText(env.ARTIFACTS, document.artifact).catch(() => {
    throw new ApplicationError({
      code: "InvalidInput",
      message:
        "The checkpoint's retained text and validation report could not be verified. Export review remains available.",
    });
  });
  return (await store.prepareScoringInput(id, verified)) ? "Prepared" : "Stopped";
}

/** One provider submission per attempt. Saved responses survive failed finalization and later retries. */
export async function submitScoring(
  env: ScoringEnvironment,
  id: string,
  transport: typeof fetch = fetch,
) {
  const store = createRepository(env.DB),
    row = await store.getScoringRuntime(id);
  if (
    !row ||
    row.run.operationId !== id ||
    row.run.completedAt ||
    !["Pending", "Running"].includes(row.operation.state)
  )
    return;
  if (row.run.result) return;
  if (!row.run.input) throw new Error("Exact scoring input is missing.");
  const version =
    row.attempt.observation?.version ?? (await inspectScoringProvider(row.run.profile, transport));
  if (!(await store.observeScoringProvider(id, version))) return;
  if (!(await store.claimScoringSubmission(id)))
    throw new Error(
      "This attempt already reserved its external submission. Retry as a new attempt.",
    );
  await store.updateOperation(id, { state: "Running", stage: "Running six platform simulations" });
  const scored = await scoreCheckpointText(row.run.profile, row.run.input, version, transport);
  await store.retainScoringResult(id, scored.raw);
}

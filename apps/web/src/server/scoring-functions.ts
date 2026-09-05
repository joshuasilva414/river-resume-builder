import {
  CaptureCheckpointRequest,
  CheckpointIdentity,
  CompareScoringRequest,
  RetryScoringRequest,
  ReviewScoringFindingRequest,
  ScoringHistoryRequest,
  ScoringIdentityRequest,
  StartScoringRequest,
} from "@river/contracts";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { Effect, Schema } from "effect";
import { bindings } from "./env";
import {
  compareScores,
  inspectCheckpointScoring,
  listCheckpointScoring,
  retryCheckpointScoring,
  reviewFinding,
  saveAndScore,
  scoringConfigured,
  scoringContext,
  startCheckpointScoring,
} from "./scoring";
import { dispatchPending, execute } from "./services";

export const getScoringSettings = createServerFn({ method: "GET" }).handler(() => {
  const env = bindings();
  return execute(env, getRequestHeaders(), Effect.succeed({ configured: scoringConfigured(env) }));
});
export const getScoringContext = createServerFn({ method: "GET" })
  .validator(Schema.decodeUnknownSync(CheckpointIdentity))
  .handler(({ data }) => {
    const env = bindings();
    return execute(env, getRequestHeaders(), scoringContext(env, data.id));
  });
export const getScoringRun = createServerFn({ method: "GET" })
  .validator(Schema.decodeUnknownSync(ScoringIdentityRequest))
  .handler(({ data }) =>
    execute(bindings(), getRequestHeaders(), inspectCheckpointScoring(data.id)),
  );
export const getScoringRuns = createServerFn({ method: "GET" })
  .validator(Schema.decodeUnknownSync(ScoringHistoryRequest))
  .handler(({ data }) => execute(bindings(), getRequestHeaders(), listCheckpointScoring(data)));
export const scoreCheckpoint = createServerFn({ method: "POST" })
  .validator(Schema.decodeUnknownSync(StartScoringRequest))
  .handler(async ({ data }) => {
    const env = bindings(),
      result = await execute(env, getRequestHeaders(), startCheckpointScoring(env, data));
    if (result.ok) await dispatchPending(env).catch(() => {});
    return result;
  });
export const captureAndScoreCheckpoint = createServerFn({ method: "POST" })
  .validator(Schema.decodeUnknownSync(CaptureCheckpointRequest))
  .handler(async ({ data }) => {
    const env = bindings(),
      result = await execute(env, getRequestHeaders(), saveAndScore(env, data));
    if (result.ok) await dispatchPending(env).catch(() => {});
    return result;
  });
export const retryScoringRun = createServerFn({ method: "POST" })
  .validator(Schema.decodeUnknownSync(RetryScoringRequest))
  .handler(async ({ data }) => {
    const env = bindings(),
      result = await execute(env, getRequestHeaders(), retryCheckpointScoring(env, data));
    if (result.ok) await dispatchPending(env).catch(() => {});
    return result;
  });
export const saveScoringFinding = createServerFn({ method: "POST" })
  .validator(Schema.decodeUnknownSync(ReviewScoringFindingRequest))
  .handler(({ data }) => execute(bindings(), getRequestHeaders(), reviewFinding(data)));
export const compareScoringRuns = createServerFn({ method: "GET" })
  .validator(Schema.decodeUnknownSync(CompareScoringRequest))
  .handler(({ data }) => execute(bindings(), getRequestHeaders(), compareScores(data)));

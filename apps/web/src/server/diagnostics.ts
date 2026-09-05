import type { AgentScope } from "@river/domain";
import { Effect, Exit, Logger } from "effect";

type DiagnosticContext =
  | {
      scope: "application";
      traceId: string;
      actorId: string | null;
      permission: AgentScope | "owner" | "identity";
    }
  | {
      scope: "workflow-dispatch";
      operationId: string;
      ownerId: string;
    }
  | {
      scope: "source-upload-recovery";
      sourceId: string;
      ownerId: string;
    };

/** Record only explicit identifiers and an exit category, never results, causes or input objects. */
export function withDiagnostics(context: DiagnosticContext) {
  const annotations =
    context.scope === "application"
      ? {
          traceId: context.traceId,
          actorId: context.actorId ?? "anonymous",
          permission: context.permission,
        }
      : context.scope === "workflow-dispatch"
        ? {
            operationId: context.operationId,
            workflowId: context.operationId,
            ownerId: context.ownerId,
          }
        : { sourceId: context.sourceId, ownerId: context.ownerId };
  return <A, E, R>(program: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
    program.pipe(
      Effect.onExit((exit) =>
        (Exit.isSuccess(exit)
          ? Effect.logInfo(`river.${context.scope}`)
          : Effect.logWarning(`river.${context.scope}`)
        ).pipe(Effect.annotateLogs({ outcome: Exit.isSuccess(exit) ? "succeeded" : "failed" })),
      ),
      Effect.annotateLogs(annotations),
      Effect.withLogSpan(`river.${context.scope}`),
      Effect.withSpan(`river.${context.scope}`, { attributes: annotations }),
      Effect.provide(Logger.layer([Logger.consoleJson, Logger.tracerLogger])),
    );
}

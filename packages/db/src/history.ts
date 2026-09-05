import type { HistorySelection } from "@river/contracts";
import {
  ApplicationError,
  canonicalJson,
  compositionEvidence,
  fingerprint,
  type Principal,
} from "@river/domain";
import { fixedPack, validateGraph } from "@river/templates";
import { observeCheckpointEvidence } from "./checkpoint-review";
import { createCheckpointRepository } from "./checkpoints";
import { createCompositionRepository } from "./composition";
import type { Database } from "./index";
import type * as s from "./schema";

function owner(actor: Principal) {
  if (actor.kind !== "owner")
    throw new ApplicationError({
      code: "Forbidden",
      message: "Only the Owner can inspect résumé history.",
    });
}
type Content = Pick<
  typeof s.checkpoints.$inferSelect,
  "data" | "graph" | "evidence" | "templateGraph" | "templateIdentity"
> & {
  posting: typeof s.jobSnapshots.$inferSelect;
  source: typeof s.checkpointSources.$inferSelect | null;
};
function artifact(operation: typeof s.operations.$inferSelect | null, revision: number | null) {
  if (!operation) return null;
  return {
    id: operation.id,
    state: operation.state,
    stage: operation.stage,
    revision,
    manifest: operation.artifacts,
    createdAt: operation.createdAt,
  };
}
async function snapshot(
  selection: HistorySelection,
  draftId: string,
  label: string | null,
  revision: number,
  createdAt: number,
  content: Content,
  pdf: ReturnType<typeof artifact>,
  request: ReturnType<typeof artifact>,
) {
  const complete = {
    ...content,
    templateGraph: content.templateGraph ?? validateGraph(fixedPack(content.data.theme)),
  };
  if (new TextEncoder().encode(canonicalJson(complete)).byteLength > 2_000_000)
    throw new ApplicationError({
      code: "InvalidInput",
      message: "This complete comparison input exceeds 2 MB. Review its saved checkpoint directly.",
    });
  return {
    selection,
    draftId,
    label,
    revision,
    createdAt,
    observedAt: Date.now(),
    digest: await fingerprint(canonicalJson({ selection, content: complete })),
    content: complete,
    pdf,
    request,
  };
}
/** Read-only snapshots pin complete historical values. Polling a head never replaces them. */
export function createHistoryRepository(db: Database) {
  const composition = createCompositionRepository(db),
    checkpoints = createCheckpointRepository(db);
  return {
    async historyDraftHead(actor: Principal, id: string) {
      owner(actor);
      const draft = await composition.getResume(actor.ownerId, id);
      if (!draft) throw new ApplicationError({ code: "NotFound", message: "Draft not found." });
      return {
        id,
        revision: draft.revision,
        previewId: draft.lastPreviewId,
        previewRevision: draft.lastPreviewRevision,
        requestId: draft.previewRequestId,
      };
    },
    async historySnapshot(actor: Principal, selection: HistorySelection) {
      owner(actor);
      if (selection.kind === "checkpoint") {
        const detail = await checkpoints.inspectCheckpoint(actor.ownerId, selection.id);
        if (!detail.posting)
          throw new ApplicationError({
            code: "NotFound",
            message: "The saved posting snapshot is unavailable.",
          });
        const { checkpoint } = detail;
        return snapshot(
          selection,
          checkpoint.draftId,
          checkpoint.label,
          checkpoint.draftRevision,
          checkpoint.createdAt,
          {
            data: checkpoint.data,
            graph: checkpoint.graph,
            evidence: checkpoint.evidence,
            templateGraph: checkpoint.templateGraph,
            templateIdentity: checkpoint.templateIdentity,
            posting: detail.posting,
            source: detail.source,
          },
          artifact(detail.operation, checkpoint.draftRevision),
          null,
        );
      }
      const detail = await composition.inspectResume(actor.ownerId, selection.id);
      const observed = await observeCheckpointEvidence(
        db,
        actor.ownerId,
        compositionEvidence(detail.draft.data, detail.graph),
      );
      // Library, evidence material, contexts and posting are immutable. Recheck the only mutable composition.
      const current = await composition.getResume(actor.ownerId, selection.id);
      if (detail.draft.revision !== selection.revision || current?.revision !== selection.revision)
        throw new ApplicationError({
          code: "Conflict",
          message:
            "The draft changed before comparison opened. Refresh its saved revision and choose it again.",
          expectedRevision: selection.revision,
          observedRevision: current?.revision,
        });
      const graph = detail.graph.map((node) => ({
        item: { id: node.item.id, currentRevisionId: node.revision.id },
        revision: { id: node.revision.id, data: node.revision.data },
      }));
      return snapshot(
        selection,
        detail.draft.id,
        null,
        detail.draft.revision,
        detail.draft.updatedAt,
        {
          data: detail.draft.data,
          graph,
          evidence: observed.captured,
          templateGraph: detail.templateGraph,
          templateIdentity: detail.templateIdentity,
          posting: detail.snapshot,
          source: null,
        },
        artifact(detail.preview, detail.draft.lastPreviewRevision),
        artifact(
          detail.request,
          detail.request && "document" in detail.request.input
            ? (detail.request.input.preview?.revision ?? null)
            : null,
        ),
      );
    },
  };
}

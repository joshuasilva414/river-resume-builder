import { type EvidenceCommand, type EvidenceSearch, ExtractionResult } from "@river/contracts";
import {
  type AgentScope,
  ApplicationError,
  type EvidenceCitation,
  type EvidenceMaterial,
  type EvidenceMaterialInput,
  fingerprint,
  resolveCitation,
} from "@river/domain";
import { Effect, Schema } from "effect";
import type { Env } from "./env";
import { Actor, attempt, Store } from "./services";

export const evidencePermissions = {
  create: "evidence:write",
  edit: "evidence:write",
  metadata: "evidence:write",
  review: "evidence:verify",
  archive: "evidence:archive",
  merge: "evidence:merge",
  "keep-separate": "evidence:merge",
  context: "evidence:write",
} as const satisfies Record<EvidenceCommand["type"], AgentScope>;
const commandNames = {
  create: "create-evidence",
  edit: "edit-evidence",
  metadata: "evidence-metadata",
  review: "review-evidence",
  archive: "archive-evidence",
  merge: "merge-evidence",
  "keep-separate": "dismiss-duplicate",
  context: "save-context",
} as const;

export const resolveMaterial = (env: Env, input: EvidenceMaterialInput) =>
  Effect.gen(function* () {
    const actor = yield* Actor;
    const store = yield* Store;
    if (!input.assertion.trim())
      return yield* Effect.fail(
        new ApplicationError({
          code: "InvalidInput",
          message: "Write an assertion before saving this claim.",
        }),
      );
    const citationKeys = input.citations.map(
      (c) => `${c.sourceId}:${c.processingId}:${c.start}:${c.end}`,
    );
    if (new Set(citationKeys).size !== citationKeys.length)
      return yield* Effect.fail(
        new ApplicationError({
          code: "InvalidInput",
          message: "Each exact source passage can be cited only once in a claim.",
        }),
      );
    if (new Set(input.contexts.map((item) => item.id)).size !== input.contexts.length)
      return yield* Effect.fail(
        new ApplicationError({ code: "InvalidInput", message: "Select each context only once." }),
      );
    for (const reference of input.contexts) {
      const context = yield* attempt(() =>
        store.getContextRevision(actor.ownerId, reference.id, reference.revisionId),
      );
      if (!context)
        return yield* Effect.fail(
          new ApplicationError({
            code: "NotFound",
            message: "A referenced context revision is unavailable.",
          }),
        );
    }
    const citations: EvidenceCitation[] = [];
    const extractions = new Map<string, ExtractionResult>();
    for (const citation of input.citations) {
      const source = yield* attempt(() => store.getSource(actor.ownerId, citation.sourceId));
      const result = yield* attempt(() =>
        store.getProcessingResult(actor.ownerId, citation.sourceId, citation.processingId),
      );
      if (!source || !result)
        return yield* Effect.fail(
          new ApplicationError({
            code: "NotFound",
            message: "A cited source or processing result is unavailable.",
          }),
        );
      let extraction = extractions.get(result.id);
      if (!extraction) {
        extraction = yield* attempt(async () => {
          const object = await env.ARTIFACTS.get(result.objectKey);
          if (!object)
            throw new ApplicationError({
              code: "Unavailable",
              message: "The cited text is temporarily unavailable. Your draft has not been saved.",
            });
          const text = await object.text();
          if ((await fingerprint(text)) !== result.digest)
            throw new ApplicationError({
              code: "Unavailable",
              message: "Source integrity could not be confirmed. Your draft has not been saved.",
            });
          return Schema.decodeUnknownSync(ExtractionResult)(JSON.parse(text));
        });
        extractions.set(result.id, extraction);
      }
      citations.push(
        yield* attempt(async () =>
          resolveCitation(citation, extraction, source.kind === "attestation"),
        ),
      );
    }
    return { ...input, citations } satisfies EvidenceMaterial;
  });

export const runEvidenceCommand = (env: Env, input: EvidenceCommand) =>
  Effect.gen(function* () {
    const actor = yield* Actor;
    const store = yield* Store;
    if (actor.kind === "agent" && !actor.scopes.includes(evidencePermissions[input.type]))
      return yield* Effect.fail(
        new ApplicationError({
          code: "Forbidden",
          message: "This credential does not allow that evidence command.",
        }),
      );
    const replay = yield* attempt(() =>
      store.replayCommand(actor.id, commandNames[input.type], input.idempotencyKey, input),
    );
    if (replay) return replay;
    switch (input.type) {
      case "create": {
        const material = yield* resolveMaterial(env, input.material);
        return yield* attempt(() => store.createEvidence(actor, input, material));
      }
      case "edit": {
        const material = yield* resolveMaterial(env, input.material);
        return yield* attempt(() => store.editEvidence(actor, input, material));
      }
      case "merge": {
        const material = yield* resolveMaterial(env, input.material);
        return yield* attempt(() => store.mergeEvidence(actor, input, material));
      }
      case "metadata":
        return yield* attempt(() => store.updateEvidenceMetadata(actor, input));
      case "review":
        return yield* attempt(() => store.reviewEvidence(actor, input));
      case "archive":
        return yield* attempt(() => store.archiveEvidence(actor, input));
      case "keep-separate":
        return yield* attempt(() => store.dismissDuplicate(actor, input));
      case "context":
        return yield* attempt(() => store.saveContext(actor, input));
    }
  });
const iso = (value: number) => new Date(value).toISOString();
export const searchEvidence = (input: EvidenceSearch) =>
  Effect.gen(function* () {
    const actor = yield* Actor;
    const store = yield* Store;
    const result = yield* attempt(() => store.searchEvidence(actor.ownerId, input));
    return {
      ...result,
      items: result.items.map(
        ({ ownerId: _owner, searchText: _search, createdAt, updatedAt, archivedAt, ...item }) => ({
          ...item,
          createdAt: iso(createdAt),
          updatedAt: iso(updatedAt),
          archivedAt: archivedAt === null ? null : iso(archivedAt),
        }),
      ),
    };
  });
export const listContexts = Effect.gen(function* () {
  const actor = yield* Actor;
  const store = yield* Store;
  const result = yield* attempt(() => store.listContexts(actor.ownerId));
  return result.map(({ record, revision }) => ({
    id: record.id,
    revision: record.revision,
    revisionId: revision.id,
    data: revision.data,
    createdAt: iso(record.createdAt),
    updatedAt: iso(record.updatedAt),
  }));
});
export const inspectEvidence = (id: string) =>
  Effect.gen(function* () {
    const actor = yield* Actor;
    const store = yield* Store;
    const claim = yield* attempt(() => store.getClaim(actor.ownerId, id));
    if (!claim)
      return yield* Effect.fail(
        new ApplicationError({ code: "NotFound", message: "Evidence Claim not found." }),
      );
    const history = yield* attempt(() => store.evidenceHistory(actor.ownerId, id));
    const sourceIds = [
      ...new Set(
        history.revisions.flatMap((revision) =>
          revision.material.citations.map((citation) => citation.sourceId),
        ),
      ),
    ];
    const sources = [];
    for (const sourceId of sourceIds) {
      const source = yield* attempt(() => store.getSource(actor.ownerId, sourceId));
      if (source)
        sources.push({
          id: source.id,
          title: source.title,
          kind: source.kind,
          filename: source.filename,
          state: source.state,
          revision: source.revision,
          currentProcessingId: source.currentProcessingId,
          digest: source.digest,
        });
    }
    const contexts = [];
    const seen = new Set<string>();
    for (const reference of history.revisions.flatMap((revision) => revision.material.contexts)) {
      if (seen.has(reference.revisionId)) continue;
      seen.add(reference.revisionId);
      const context = yield* attempt(() =>
        store.getContextRevision(actor.ownerId, reference.id, reference.revisionId),
      );
      if (context) contexts.push({ id: reference.id, revisionId: context.id, data: context.data });
    }
    return {
      claim: {
        id: claim.id,
        revision: claim.revision,
        currentRevisionId: claim.currentRevisionId,
        metadata: claim.metadata,
        assertion: claim.assertion,
        reviewState: claim.reviewState,
        currentDecisionId: claim.currentDecisionId,
        archivedAt: claim.archivedAt === null ? null : iso(claim.archivedAt),
        mergedIntoId: claim.mergedIntoId,
        createdAt: iso(claim.createdAt),
        updatedAt: iso(claim.updatedAt),
      },
      revisions: history.revisions.map(({ createdAt, ...revision }) => ({
        ...revision,
        createdAt: iso(createdAt),
      })),
      decisions: history.decisions.map(({ createdAt, ...decision }) => ({
        ...decision,
        createdAt: iso(createdAt),
      })),
      activity: history.activity.map(({ createdAt, before, after, ...entry }) => ({
        ...entry,
        createdAt: iso(createdAt),
        before: JSON.stringify(before, null, 2),
        after: JSON.stringify(after, null, 2),
      })),
      sources,
      contexts,
    };
  });
export const listDuplicates = Effect.gen(function* () {
  const actor = yield* Actor;
  const store = yield* Store;
  const pairs = yield* attempt(() => store.listDuplicates(actor.ownerId));
  return pairs.map((pair) => ({
    id: pair.id,
    revision: pair.revision,
    similarity: pair.similarity,
    first: pair.first
      ? {
          id: pair.first.id,
          revision: pair.first.revision,
          revisionId: pair.first.currentRevisionId,
          assertion: pair.first.assertion,
          reviewState: pair.first.reviewState,
        }
      : null,
    second: pair.second
      ? {
          id: pair.second.id,
          revision: pair.second.revision,
          revisionId: pair.second.currentRevisionId,
          assertion: pair.second.assertion,
          reviewState: pair.second.reviewState,
        }
      : null,
  }));
});

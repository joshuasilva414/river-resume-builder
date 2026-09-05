import type { InspectLibraryRequest, LibrarySearch, SaveLibraryRequest } from "@river/contracts";
import {
  ApplicationError,
  canonicalJson,
  type LibraryData,
  type LibraryReference,
  newId,
  type Principal,
  validateLibraryData,
} from "@river/domain";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { createCommands, type Guard, type Write } from "./commands";
import type { Database } from "./index";
import * as s from "./schema";

export const libraryChildren = (data: LibraryData): readonly LibraryReference[] =>
  data.kind === "content"
    ? []
    : data.kind === "block"
      ? data.fields.flatMap((field) => field.contents)
      : data.blocks;
export function createLibraryRepository(db: Database) {
  const commands = createCommands(db);
  const getLibraryItem = async (ownerId: string, id: string) =>
    (
      await db
        .select()
        .from(s.libraryItems)
        .where(and(eq(s.libraryItems.ownerId, ownerId), eq(s.libraryItems.id, id)))
        .limit(1)
    )[0];
  const getLibraryRevision = async (ownerId: string, reference: LibraryReference) =>
    (
      await db
        .select({ item: s.libraryItems, revision: s.libraryRevisions })
        .from(s.libraryItems)
        .innerJoin(s.libraryRevisions, eq(s.libraryRevisions.itemId, s.libraryItems.id))
        .where(
          and(
            eq(s.libraryItems.ownerId, ownerId),
            eq(s.libraryItems.id, reference.itemId),
            eq(s.libraryRevisions.id, reference.revisionId),
          ),
        )
        .limit(1)
    )[0];
  type Entry = NonNullable<Awaited<ReturnType<typeof getLibraryRevision>>>;
  /** Load only immutable referenced nodes; moving library pointers never substitute their values. */
  const libraryGraph = async (ownerId: string, references: readonly LibraryReference[]) => {
    const entries = new Map<string, Entry>();
    const identities = new Map<string, string>();
    let pending = references;
    while (pending.length) {
      for (const ref of pending) {
        const itemId = identities.get(ref.revisionId);
        if (itemId && itemId !== ref.itemId)
          throw new ApplicationError({
            code: "InvalidInput",
            message: "A library revision was bound to the wrong item.",
          });
        identities.set(ref.revisionId, ref.itemId);
      }
      const unique = [
        ...new Map(
          pending.filter((ref) => !entries.has(ref.revisionId)).map((ref) => [ref.revisionId, ref]),
        ).values(),
      ];
      if (!unique.length) break;
      if (entries.size + unique.length > 300)
        throw new ApplicationError({
          code: "InvalidInput",
          message: "This composition exceeds the 300-node library graph limit.",
        });
      const next: LibraryReference[] = [];
      for (let offset = 0; offset < unique.length; offset += 80) {
        const chunk = unique.slice(offset, offset + 80);
        const found = await db
          .select({ item: s.libraryItems, revision: s.libraryRevisions })
          .from(s.libraryRevisions)
          .innerJoin(s.libraryItems, eq(s.libraryItems.id, s.libraryRevisions.itemId))
          .where(
            and(
              eq(s.libraryItems.ownerId, ownerId),
              inArray(
                s.libraryRevisions.id,
                chunk.map((ref) => ref.revisionId),
              ),
            ),
          );
        for (const ref of chunk) {
          const entry = found.find(
            (value) => value.item.id === ref.itemId && value.revision.id === ref.revisionId,
          );
          if (!entry)
            throw new ApplicationError({
              code: "NotFound",
              message: "A referenced library revision is unavailable.",
            });
          entries.set(ref.revisionId, entry);
          next.push(...libraryChildren(entry.revision.data));
        }
      }
      pending = next;
    }
    return [...entries.values()];
  };
  const observeLibrary = async (actor: Principal, id: string, revision: number) => {
    const item = await getLibraryItem(actor.ownerId, id);
    if (!item) throw new ApplicationError({ code: "NotFound", message: "Library item not found." });
    if (item.revision !== revision)
      throw new ApplicationError({
        code: "Conflict",
        message:
          "This library item changed. Compare the saved revision before applying your changes.",
        expectedRevision: revision,
        observedRevision: item.revision,
      });
    return item;
  };
  const libraryGuard = (actor: Principal, id: string, revision: number): Guard => ({
    condition: sql`EXISTS (SELECT 1 FROM library_items WHERE id = ${id} AND owner_id = ${actor.ownerId} AND revision = ${revision})`,
    check: async () => {
      await observeLibrary(actor, id, revision);
    },
  });
  return {
    getLibraryItem,
    getLibraryRevision,
    libraryGraph,
    observeLibrary,
    libraryGuard,
    async listLibrary(ownerId: string, input: LibrarySearch) {
      const rows = await db
        .select({ item: s.libraryItems, revision: s.libraryRevisions })
        .from(s.libraryItems)
        .innerJoin(s.libraryRevisions, eq(s.libraryRevisions.id, s.libraryItems.currentRevisionId))
        .where(
          and(
            eq(s.libraryItems.ownerId, ownerId),
            eq(s.libraryItems.kind, input.kind),
            input.type ? eq(s.libraryItems.type, input.type) : undefined,
            input.query
              ? sql`(instr(lower(${s.libraryItems.label}), lower(${input.query})) > 0 OR instr(lower(json_extract(${s.libraryRevisions.data}, '$.wording')), lower(${input.query})) > 0)`
              : undefined,
          ),
        )
        .orderBy(desc(s.libraryItems.updatedAt), desc(s.libraryItems.id))
        .limit(51)
        .offset(input.offset);
      return { items: rows.slice(0, 50), hasMore: rows.length > 50 };
    },
    async inspectLibrary(ownerId: string, input: InspectLibraryRequest) {
      const item = await getLibraryItem(ownerId, input.id);
      if (!item)
        throw new ApplicationError({ code: "NotFound", message: "Library item not found." });
      const graph = await libraryGraph(ownerId, [
        { itemId: item.id, revisionId: input.revisionId ?? item.currentRevisionId },
      ]);
      const revision = graph.find(
        (entry) =>
          entry.item.id === item.id &&
          entry.revision.id === (input.revisionId ?? item.currentRevisionId),
      )?.revision;
      if (!revision)
        throw new ApplicationError({ code: "NotFound", message: "Library revision not found." });
      const history = await db
        .select({
          id: s.libraryRevisions.id,
          label: s.libraryRevisions.label,
          rationale: s.libraryRevisions.rationale,
          createdAt: s.libraryRevisions.createdAt,
          actorId: s.libraryRevisions.actorId,
        })
        .from(s.libraryRevisions)
        .where(eq(s.libraryRevisions.itemId, item.id))
        .orderBy(desc(s.libraryRevisions.createdAt), desc(s.libraryRevisions.id))
        .limit(100);
      const refs = [
        ...new Map(
          graph
            .flatMap((entry) =>
              entry.revision.data.kind === "content" ? entry.revision.data.evidence : [],
            )
            .map((ref) => [ref.revisionId, ref]),
        ).values(),
      ];
      const evidence = [];
      for (let offset = 0; offset < refs.length; offset += 80) {
        const chunk = refs.slice(offset, offset + 80);
        const entries = await db
          .select({ claim: s.claims, revision: s.evidenceRevisions, decision: s.reviewDecisions })
          .from(s.evidenceRevisions)
          .innerJoin(s.claims, eq(s.claims.id, s.evidenceRevisions.claimId))
          .leftJoin(
            s.reviewDecisions,
            sql`${s.reviewDecisions.id} = (SELECT d.id FROM evidence_review_decisions d WHERE d.claim_id = ${s.claims.id} AND d.revision_id = ${s.evidenceRevisions.id} ORDER BY d.created_at DESC, d.id DESC LIMIT 1)`,
          )
          .where(
            and(
              eq(s.claims.ownerId, ownerId),
              inArray(
                s.evidenceRevisions.id,
                chunk.map((ref) => ref.revisionId),
              ),
            ),
          );
        evidence.push(
          ...entries.map((entry) => ({
            claimId: entry.claim.id,
            revisionId: entry.revision.id,
            currentRevisionId: entry.claim.currentRevisionId,
            assertion: entry.revision.material.assertion,
            material: entry.revision.material,
            state: entry.decision?.state ?? "Draft",
            archived: entry.claim.archivedAt !== null,
            stale: entry.claim.currentRevisionId !== entry.revision.id,
            unsupported: entry.revision.material.citations.length === 0,
          })),
        );
      }
      return { item, revision, graph, history, evidence };
    },
    async saveLibrary(actor: Principal, input: SaveLibraryRequest) {
      if (actor.kind !== "owner")
        throw new ApplicationError({
          code: "Forbidden",
          message: "Only the Owner can change reusable content.",
        });
      return commands.commit(actor, "save-library", input.idempotencyKey, input, async () => {
        if (!input.label.trim() || (input.id === null) !== (input.revision === null))
          throw new ApplicationError({
            code: "InvalidInput",
            message: "Provide a library label and the observed revision for an existing item.",
          });
        validateLibraryData(input.data);
        if (new TextEncoder().encode(canonicalJson(input.data)).byteLength > 128 * 1024)
          throw new ApplicationError({
            code: "InvalidInput",
            message: "The library revision exceeds its 128 KiB limit.",
          });
        const previous =
          input.id !== null && input.revision !== null
            ? await observeLibrary(actor, input.id, input.revision)
            : null;
        if (previous && (previous.kind !== input.data.kind || previous.type !== input.data.type))
          throw new ApplicationError({
            code: "InvalidInput",
            message: "Create a separate library item to use a different kind or content type.",
          });
        const children = libraryChildren(input.data);
        const graph = await libraryGraph(actor.ownerId, children);
        if (graph.length >= 300)
          throw new ApplicationError({
            code: "InvalidInput",
            message: "This composition exceeds the 300-node library graph limit.",
          });
        for (const ref of children) {
          const child = graph.find(
            (entry) => entry.revision.id === ref.revisionId && entry.item.id === ref.itemId,
          );
          const expectedKind = input.data.kind === "section" ? "block" : "content";
          if (
            !child ||
            child.revision.data.kind !== expectedKind ||
            child.revision.data.type !== input.data.type
          )
            throw new ApplicationError({
              code: "InvalidInput",
              message: "A child binding has an incompatible kind or content type.",
            });
        }
        if (input.data.kind === "content")
          for (const ref of input.data.evidence) {
            const target = (
              await db
                .select({ id: s.evidenceRevisions.id })
                .from(s.evidenceRevisions)
                .innerJoin(s.claims, eq(s.claims.id, s.evidenceRevisions.claimId))
                .where(
                  and(
                    eq(s.claims.ownerId, actor.ownerId),
                    eq(s.claims.id, ref.claimId),
                    eq(s.evidenceRevisions.id, ref.revisionId),
                  ),
                )
                .limit(1)
            )[0];
            if (!target)
              throw new ApplicationError({
                code: "NotFound",
                message: "A supporting Evidence Revision is unavailable.",
              });
          }
        const id = previous?.id ?? newId(),
          revisionId = newId(),
          revision = previous ? previous.revision + 1 : 0,
          now = Date.now();
        const values = {
          label: input.label,
          currentRevisionId: revisionId,
          revision,
          updatedAt: now,
        };
        const writes: Write[] = [
          previous
            ? db.update(s.libraryItems).set(values).where(eq(s.libraryItems.id, id))
            : db.insert(s.libraryItems).values({
                id,
                ownerId: actor.ownerId,
                kind: input.data.kind,
                type: input.data.type,
                createdAt: now,
                ...values,
              }),
          db.insert(s.libraryRevisions).values({
            id: revisionId,
            itemId: id,
            data: input.data,
            label: input.label,
            rationale: input.rationale,
            actorId: actor.id,
            createdAt: now,
          }),
          ...[...new Set(children.map((child) => child.revisionId))].map((childRevisionId) =>
            db.insert(s.libraryChildReferences).values({ revisionId, childRevisionId }),
          ),
          ...(input.data.kind === "content"
            ? input.data.evidence.map((ref) =>
                db
                  .insert(s.libraryEvidenceReferences)
                  .values({ revisionId, evidenceRevisionId: ref.revisionId }),
              )
            : []),
        ];
        return {
          result: { id, revision, revisionId },
          guards: previous ? [libraryGuard(actor, id, previous.revision)] : [],
          writes,
          history: [
            {
              entityId: id,
              before: previous
                ? { revision: previous.revision, revisionId: previous.currentRevisionId }
                : null,
              after: {
                revision,
                revisionId,
                label: input.label,
                kind: input.data.kind,
                type: input.data.type,
              },
            },
          ],
        };
      });
    },
  };
}

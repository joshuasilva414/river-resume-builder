import type { ExportMetadata, RecordKind, WorkspacePayload } from "@river/domain/workspace";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { user } from "./schema";

/** Versioned JSON replaces schema bundles and the placement graph in active workflows. */
export const workspaceRecords = sqliteTable(
  "workspace_records",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id),
    kind: text("kind").$type<RecordKind>().notNull(),
    name: text("name").notNull(),
    revision: integer("revision").notNull(),
    payload: text("payload", { mode: "json" }).$type<WorkspacePayload>().notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    deletedAt: integer("deleted_at"),
  },
  (table) => [index("workspace_records_owner_kind").on(table.ownerId, table.kind, table.updatedAt)],
);
export const workspaceRecordRevisions = sqliteTable(
  "workspace_record_revisions",
  {
    id: text("id").primaryKey(),
    recordId: text("record_id")
      .notNull()
      .references(() => workspaceRecords.id),
    revision: integer("revision").notNull(),
    payload: text("payload", { mode: "json" }).$type<WorkspacePayload>().notNull(),
    actorId: text("actor_id").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [uniqueIndex("workspace_record_revision").on(table.recordId, table.revision)],
);
export const workspaceExports = sqliteTable(
  "workspace_exports",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id),
    versionId: text("version_id")
      .notNull()
      .references(() => workspaceRecords.id),
    objectKey: text("object_key").notNull(),
    metadata: text("metadata", { mode: "json" }).$type<ExportMetadata>().notNull(),
    state: text("state").$type<"Prepared" | "Complete">().notNull(),
    createdAt: integer("created_at").notNull(),
    completedAt: integer("completed_at"),
  },
  (table) => [index("workspace_exports_owner").on(table.ownerId, table.createdAt)],
);
export const workspaceArchives = sqliteTable("workspace_archives", {
  ownerId: text("owner_id")
    .primaryKey()
    .references(() => user.id),
  version: integer("version").notNull(),
  counts: text("counts", { mode: "json" }).$type<Record<string, number>>().notNull(),
  createdAt: integer("created_at").notNull(),
});
export const workspaceArchiveRecords = sqliteTable(
  "workspace_archive_records",
  {
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id),
    category: text("category").notNull(),
    id: text("id").notNull(),
    name: text("name").notNull(),
    data: text("data", { mode: "json" }).$type<unknown>().notNull(),
    archivedAt: integer("archived_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.ownerId, table.category, table.id] })],
);

export type WorkspaceRunKind = "fact-import" | "suggestion" | "resume-score" | "template-score";
/** Inputs and provider outputs are retained as JSON text to keep transport boundaries explicit. */
export const workspaceRuns = sqliteTable(
  "workspace_runs",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id),
    operationId: text("operation_id").notNull(),
    kind: text("kind").$type<WorkspaceRunKind>().notNull(),
    targetId: text("target_id"),
    input: text("input").notNull(),
    result: text("result"),
    metadata: text("metadata"),
    state: text("state").$type<"Running" | "Complete" | "Failed">().notNull(),
    error: text("error"),
    createdAt: integer("created_at").notNull(),
    completedAt: integer("completed_at"),
  },
  (table) => [index("workspace_runs_owner").on(table.ownerId, table.kind, table.createdAt)],
);

export const jobFactSelections = sqliteTable("job_fact_selections", {
  jobId: text("job_id").primaryKey(),
  factIds: text("fact_ids", { mode: "json" }).$type<string[]>().notNull(),
  updatedAt: integer("updated_at").notNull(),
});

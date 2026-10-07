import type { ArtifactManifest, FeedbackKind, FeedbackStatus } from "@river/contracts";
import type {
  AiExecutionMetadata,
  AiProvider,
  AiSelection,
  BackupObject,
  CommandOutcome,
  LegacyAgentScope,
  OperationState,
  WorkspacePreferences,
} from "@river/domain";
import type { JobTargetInput } from "@river/domain/workspace";

type JobDetails = JobTargetInput["details"];

/** Historical tables remain for read-only archival and database backup. Opaque JSON is never accepted by active commands. */
import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export * from "./usage-schema";

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});
export const feedback = sqliteTable(
  "feedback",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id),
    kind: text("kind").$type<FeedbackKind>().notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    status: text("status").$type<FeedbackStatus>().notNull().default("New"),
    response: text("response").notNull().default(""),
    revision: integer("revision").notNull().default(0),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    index("feedback_owner_created_idx").on(table.ownerId, table.createdAt, table.id),
    index("feedback_status_created_idx").on(table.status, table.createdAt, table.id),
  ],
);
export const aiConnections = sqliteTable(
  "ai_connections",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id),
    provider: text("provider").$type<AiProvider>().notNull(),
    revision: integer("revision").notNull().default(0),
    encryptedKey: text("encrypted_key"),
    keySuffix: text("key_suffix").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    removedAt: integer("removed_at"),
  },
  (table) => [
    uniqueIndex("ai_connection_active_provider")
      .on(table.ownerId, table.provider)
      .where(sql`${table.removedAt} IS NULL`),
  ],
);
export const workspacePreferences = sqliteTable("workspace_preferences", {
  ownerId: text("owner_id")
    .primaryKey()
    .references(() => user.id),
  revision: integer("revision").notNull().default(0),
  data: text("data", { mode: "json" }).$type<WorkspacePreferences>().notNull(),
});
/** Shared auth throttles survive request-scoped Better Auth instances and Worker isolates. */
export const rateLimit = sqliteTable("rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: integer("last_request").notNull(),
});

export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    token: text("token").notNull().unique(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_user").on(table.userId)],
);
export const account = sqliteTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    issuer: text("issuer").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp_ms" }),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp_ms" }),
    scope: text("scope"),
    password: text("password"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("account_user").on(table.userId),
    uniqueIndex("account_issuer_identity").on(table.issuer, table.accountId),
  ],
);
export const verification = sqliteTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("verification_identifier").on(table.identifier)],
);

export const credentials = sqliteTable(
  "agent_credentials",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id),
    name: text("name").notNull(),
    secretHash: text("secret_hash").notNull(),
    scopes: text("scopes", { mode: "json" }).$type<readonly LegacyAgentScope[]>().notNull(),
    revision: integer("revision").notNull().default(0),
    createdAt: integer("created_at").notNull(),
    expiresAt: integer("expires_at"),
    revokedAt: integer("revoked_at"),
    lastUsedAt: integer("last_used_at"),
  },
  (table) => [index("credentials_owner").on(table.ownerId)],
);

export const operations = sqliteTable(
  "operations",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id),
    state: text("state").$type<OperationState>().notNull(),
    stage: text("stage").notNull(),
    input: text("input", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
    artifacts: text("artifacts", { mode: "json" }).$type<ArtifactManifest>(),
    failure: text("failure"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    index("operations_owner_created").on(table.ownerId, table.createdAt),
    index("operations_created").on(table.createdAt),
    index("operations_state").on(table.state),
  ],
);
export const backups = sqliteTable("database_backups", {
  date: text("date").primaryKey(),
  attempts: integer("attempts").notNull().default(1),
  operationId: text("operation_id")
    .notNull()
    .references(() => operations.id),
  manifest: text("manifest", { mode: "json" }).$type<BackupObject>(),
  createdAt: integer("created_at").notNull(),
  completedAt: integer("completed_at"),
});

export const dispatches = sqliteTable("dispatches", {
  operationId: text("operation_id")
    .primaryKey()
    .references(() => operations.id),
  dispatchedAt: integer("dispatched_at"),
  attempts: integer("attempts").notNull().default(0),
});
export const receipts = sqliteTable(
  "command_receipts",
  {
    actorId: text("actor_id").notNull(),
    command: text("command").notNull(),
    key: text("key").notNull(),
    fingerprint: text("fingerprint").notNull(),
    resultId: text("result_id").notNull(),
    outcome: text("outcome", { mode: "json" }).$type<CommandOutcome>(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.actorId, table.command, table.key] })],
);
export const audit = sqliteTable("audit", {
  id: text("id").primaryKey(),
  actorId: text("actor_id").notNull(),
  command: text("command").notNull(),
  entityId: text("entity_id").notNull(),
  before: text("before", { mode: "json" }).$type<unknown>(),
  after: text("after", { mode: "json" }).$type<unknown>(),
  createdAt: integer("created_at").notNull(),
});

export const mutationGuards = sqliteTable(
  "mutation_guards",
  {
    id: text("id").primaryKey(),
    passed: integer("passed").notNull(),
  },
  (table) => [check("expected_revision_matches", sql`${table.passed} = 1`)],
);

/** Original content and provenance are immutable; processing may be retried with a new identity. */
export const sources = sqliteTable(
  "sources",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id),
    title: text("title").notNull(),
    filename: text("filename").notNull(),
    mime: text("mime")
      .$type<
        | "application/pdf"
        | "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        | "text/plain"
        | "text/markdown"
      >()
      .notNull(),
    kind: text("kind").$type<string>().notNull(),
    provenanceUrl: text("provenance_url"),
    note: text("note").notNull(),
    digest: text("digest").notNull(),
    byteLength: integer("byte_length").notNull(),
    objectKey: text("object_key").notNull(),
    state: text("state").$type<"Uploading" | "Processing" | "Ready" | "Failed">().notNull(),
    revision: integer("revision").notNull().default(0),
    operationId: text("operation_id").notNull(),
    currentProcessingId: text("current_processing_id"),
    archivedAt: integer("archived_at"),
    extractionAi: text("extraction_ai", { mode: "json" }).$type<AiSelection>(),
    failure: text("failure"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    index("sources_owner_created").on(table.ownerId, table.createdAt),
    index("sources_digest").on(table.ownerId, table.digest),
  ],
);

/** Maintenance progress is separate from the immutable source and its Owner-visible revision. */
export const processingResults = sqliteTable(
  "source_processing_results",
  {
    id: text("id").primaryKey(),
    sourceId: text("source_id")
      .notNull()
      .references(() => sources.id),
    operationId: text("operation_id")
      .notNull()
      .references(() => operations.id),
    objectKey: text("object_key").notNull(),
    digest: text("digest").notNull(),
    parser: text("parser").notNull(),
    parserVersion: text("parser_version").notNull(),
    characterCount: integer("character_count").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("processing_source").on(table.sourceId)],
);

export const contexts = sqliteTable(
  "contexts",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id),
    kind: text("kind").$type<string>().notNull(),
    label: text("label").notNull(),
    revision: integer("revision").notNull(),
    currentRevisionId: text("current_revision_id").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    index("context_owner").on(table.ownerId),
    uniqueIndex("one_owner_profile").on(table.ownerId).where(sql`${table.kind} = 'Owner Profile'`),
  ],
);
export const contextRevisions = sqliteTable(
  "context_revisions",
  {
    id: text("id").primaryKey(),
    contextId: text("context_id")
      .notNull()
      .references(() => contexts.id),
    data: text("data", { mode: "json" }).$type<unknown>().notNull(),
    actorId: text("actor_id").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("context_revision_parent").on(table.contextId)],
);
export const claims = sqliteTable(
  "evidence_claims",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id),
    revision: integer("revision").notNull(),
    currentRevisionId: text("current_revision_id").notNull(),
    assertion: text("assertion").notNull(),
    metadata: text("metadata", { mode: "json" }).$type<unknown>().notNull(),
    reviewState: text("review_state").$type<unknown>().notNull(),
    currentDecisionId: text("current_decision_id"),
    archivedAt: integer("archived_at"),
    mergedIntoId: text("merged_into_id"),
    searchText: text("search_text").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    index("evidence_owner_updated").on(table.ownerId, table.updatedAt),
    index("evidence_owner_state").on(table.ownerId, table.archivedAt, table.reviewState),
  ],
);
export const evidenceRevisions = sqliteTable(
  "evidence_revisions",
  {
    id: text("id").primaryKey(),
    claimId: text("claim_id")
      .notNull()
      .references(() => claims.id),
    material: text("material", { mode: "json" }).$type<unknown>().notNull(),
    actorId: text("actor_id").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("evidence_revision_claim").on(table.claimId)],
);
export const jobs = sqliteTable(
  "job_targets",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id),
    revision: integer("revision").notNull().default(0),
    details: text("details", { mode: "json" }).$type<JobDetails>().notNull(),
    currentSnapshotId: text("current_snapshot_id").notNull(),
    archivedAt: integer("archived_at"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [index("jobs_owner_lifecycle").on(table.ownerId, table.archivedAt)],
);

export const jobSnapshots = sqliteTable(
  "job_posting_snapshots",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id),
    details: text("details", { mode: "json" }).$type<JobDetails>().notNull(),
    text: text("text").notNull(),
    url: text("url"),
    digest: text("digest").notNull(),
    actorId: text("actor_id").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("posting_job_history").on(table.jobId, table.createdAt)],
);

export const libraryItems = sqliteTable(
  "library_items",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id),
    kind: text("kind").$type<string>().notNull(),
    type: text("type").$type<unknown>().notNull(),
    label: text("label").notNull(),
    revision: integer("revision").notNull().default(0),
    currentRevisionId: text("current_revision_id").notNull(),
    archivedAt: integer("archived_at"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    index("library_owner_kind").on(table.ownerId, table.kind, table.type, table.updatedAt),
  ],
);
export const libraryRevisions = sqliteTable(
  "library_revisions",
  {
    id: text("id").primaryKey(),
    itemId: text("item_id")
      .notNull()
      .references(() => libraryItems.id),
    data: text("data", { mode: "json" }).$type<unknown>().notNull(),
    label: text("label").notNull(),
    rationale: text("rationale").notNull(),
    actorId: text("actor_id").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("library_revision_history").on(table.itemId, table.createdAt)],
);
export const resumeDrafts = sqliteTable(
  "resume_drafts",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id),
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id),
    snapshotId: text("snapshot_id")
      .notNull()
      .references(() => jobSnapshots.id),
    revision: integer("revision").notNull().default(0),
    data: text("data", { mode: "json" }).$type<unknown>().notNull(),
    branchOf: text("branch_of"),
    branchRevision: integer("branch_revision"),
    previewRequestId: text("preview_request_id"),
    lastPreviewId: text("last_preview_id"),
    lastPreviewRevision: integer("last_preview_revision"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [index("resume_drafts_job").on(table.ownerId, table.jobId, table.updatedAt)],
);
export const checkpoints = sqliteTable(
  "resume_checkpoints",
  {
    id: text("id").primaryKey(),
    label: text("label"),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id),
    draftId: text("draft_id")
      .notNull()
      .references(() => resumeDrafts.id),
    draftRevision: integer("draft_revision").notNull(),
    snapshotId: text("snapshot_id")
      .notNull()
      .references(() => jobSnapshots.id),
    data: text("data", { mode: "json" }).$type<unknown>().notNull(),
    graph: text("graph", { mode: "json" }).$type<unknown>().notNull(),
    evidence: text("evidence", { mode: "json" }).$type<unknown>().notNull(),
    document: text("document", { mode: "json" }).$type<unknown>().notNull(),
    templateIdentity: text("template_identity").notNull(),
    templateGraph: text("template_graph", { mode: "json" }).$type<unknown>(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("checkpoint_draft_history").on(table.ownerId, table.draftId, table.createdAt)],
);
export const scoringRuns = sqliteTable(
  "scoring_runs",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id),
    checkpointId: text("checkpoint_id")
      .notNull()
      .references(() => checkpoints.id),
    snapshotId: text("snapshot_id")
      .notNull()
      .references(() => jobSnapshots.id),
    documentOperationId: text("document_operation_id")
      .notNull()
      .references(() => operations.id),
    operationId: text("operation_id")
      .notNull()
      .references(() => operations.id),
    revision: integer("revision").notNull().default(0),
    attempts: integer("attempts").notNull().default(1),
    profile: text("profile", { mode: "json" }).$type<unknown>().notNull(),
    input: text("input", { mode: "json" }).$type<unknown>(),
    result: text("result", { mode: "json" }).$type<unknown>(),
    completedAt: integer("completed_at"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    index("scoring_checkpoint_history").on(table.ownerId, table.checkpointId, table.createdAt),
  ],
);
export const templateDesigns = sqliteTable(
  "template_designs",
  {
    archivedAt: integer("archived_at"),
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id),
    name: text("name").notNull(),
    scope: text("scope", { mode: "json" }).$type<unknown>().notNull(),
    revision: integer("revision").notNull().default(0),
    currentRevisionId: text("current_revision_id").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [index("template_designs_owner").on(table.ownerId, table.updatedAt)],
);
export const templateRevisions = sqliteTable(
  "template_revisions",
  {
    id: text("id").primaryKey(),
    designId: text("design_id")
      .notNull()
      .references(() => templateDesigns.id),
    version: integer("version").notNull(),
    graph: text("graph", { mode: "json" }).$type<unknown>().notNull(),
    digest: text("digest").notNull(),
    origins: text("origins", { mode: "json" }).$type<unknown>().notNull(),
    state: text("state").$type<unknown>().notNull().default("Draft"),
    reviewRevision: integer("review_revision").notNull().default(0),
    validationAttempts: integer("validation_attempts").notNull().default(0),
    validationId: text("validation_id"),
    createdAt: integer("created_at").notNull(),
    actorId: text("actor_id").notNull(),
  },
  (table) => [
    uniqueIndex("template_revision_version").on(table.designId, table.version),
    index("template_revision_state").on(table.state),
  ],
);
export const templateValidations = sqliteTable("template_validations", {
  approveOnSuccess: integer("approve_on_success", { mode: "boolean" }).notNull().default(false),
  id: text("id").primaryKey(),
  revisionId: text("revision_id")
    .notNull()
    .references(() => templateRevisions.id),
  operationId: text("operation_id")
    .notNull()
    .references(() => operations.id),
  graphDigest: text("graph_digest").notNull(),
  fixtureSetDigest: text("fixture_set_digest").notNull(),
  renderer: text("renderer").notNull(),
  validator: text("validator").notNull(),
  report: text("report", { mode: "json" }).$type<unknown>(),
  reportDigest: text("report_digest"),
  createdAt: integer("created_at").notNull(),
  completedAt: integer("completed_at"),
});
export const templateValidationFixtures = sqliteTable(
  "template_validation_fixtures",
  {
    validationId: text("validation_id")
      .notNull()
      .references(() => templateValidations.id),
    fixtureId: text("fixture_id").notNull(),
    result: text("result", { mode: "json" }).$type<unknown>().notNull(),
  },
  (table) => [primaryKey({ columns: [table.validationId, table.fixtureId] })],
);

export const templateScoringRuns = sqliteTable(
  "template_scoring_runs",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id),
    base: text("base", { mode: "json" }).$type<unknown>().notNull(),
    graph: text("graph", { mode: "json" }).$type<unknown>().notNull(),
    graphDigest: text("graph_digest").notNull(),
    fixtureSet: text("fixture_set", { mode: "json" }).$type<unknown>().notNull(),
    profile: text("profile", { mode: "json" }).$type<unknown>().notNull(),
    operationId: text("operation_id")
      .notNull()
      .references(() => operations.id),
    revision: integer("revision").notNull().default(0),
    attempts: integer("attempts").notNull().default(1),
    createdAt: integer("created_at").notNull(),
    completedAt: integer("completed_at"),
  },
  (table) => [
    index("template_scoring_history").on(table.ownerId, table.graphDigest, table.createdAt),
  ],
);

export const templateScoringFixtures = sqliteTable(
  "template_scoring_fixtures",
  {
    runId: text("run_id")
      .notNull()
      .references(() => templateScoringRuns.id),
    fixtureId: text("fixture_id").notNull(),
    document: text("document", { mode: "json" }).$type<unknown>(),
    documentDigest: text("document_digest"),
    rawResponseJson: text("raw_response_json"),
    resultDigest: text("result_digest"),
    resultOperationId: text("result_operation_id").references(() => operations.id),
    receivedAt: integer("received_at"),
  },
  (table) => [primaryKey({ columns: [table.runId, table.fixtureId] })],
);

export const aiExecutionMetadata = sqliteTable("ai_execution_metadata", {
  operationId: text("operation_id")
    .primaryKey()
    .references(() => operations.id),
  ownerId: text("owner_id")
    .notNull()
    .references(() => user.id),
  data: text("data", { mode: "json" }).$type<AiExecutionMetadata>().notNull(),
  createdAt: integer("created_at").notNull(),
});

export * from "./workspace-schema";

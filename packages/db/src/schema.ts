import type { ArtifactManifest, CreateSourceRequest } from "@river/contracts";
import type {
  AgentScope,
  AiProfile,
  BackupObject,
  CapturedEvidence,
  CommandOutcome,
  Composition,
  ContentType,
  ContextData,
  DuplicateAiInput,
  DuplicateAiOutput,
  DuplicateAiProfile,
  EvidenceMaterial,
  EvidenceMetadata,
  EvidenceStatus,
  ExportIssue,
  JobAiInput,
  JobAiProposal,
  JobDetails,
  JobWorkspace,
  LibraryData,
  LibraryGraphNode,
  LibraryKind,
  OperationState,
  ResumeDocument,
  ReviewState,
  ScoringFindingOutcome,
  ScoringProfile,
  SourceAiInput,
  SourceAiProfile,
  SourceCandidate,
  SourceFields,
  Theme,
  WordingInput,
  WordingProfile,
  WordingProposal,
} from "@river/domain";
import type {
  AtsFixtureSet,
  TemplateAiInput,
  TemplateAiProfile,
  TemplateBase,
  TemplateCandidate,
  TemplateGraph,
  TemplateLifecycle,
  TemplateOrigin,
  TemplateScope,
} from "@river/templates";
import type {
  SourceComparison,
  SourceRefinementCandidate,
  SourceRefinementProfile,
} from "@river/templates/source-refinement";
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
import type { RefinementDependencies, SourceRefinementInput } from "./refinement-types";
import type {
  ScoringFailure,
  ScoringInput,
  ScoringObservation,
  ScoringResult,
} from "./scoring-types";
import type { TemplateScoringDocument, TemplateScoringReport } from "./template-scoring-types";
import type {
  TemplateDependency,
  TemplateFixtureResult,
  TemplateValidationReport,
} from "./template-types";

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
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
    scopes: text("scopes", { mode: "json" }).$type<readonly AgentScope[]>().notNull(),
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
    input: text("input", { mode: "json" })
      .$type<
        | {
            document: ResumeDocument;
            theme: Theme;
            preview?: { draftId: string; revision: number };
            checkpointId?: string;
            templateIdentity?: string;
            templateGraph?: TemplateGraph;
          }
        | { sourceId: string; processingId: string }
        | { type: "job-ai"; taskId: string }
        | { type: "wording-ai"; taskId: string }
        | { type: "source-ai"; taskId: string }
        | { type: "duplicate-ai"; taskId: string }
        | { type: "template-validation"; validationId: string }
        | { type: "template-ai"; taskId: string }
        | { type: "source-refinement"; taskId: string }
        | { type: "source-refinement-accept"; taskId: string }
        | { type: "database-backup"; date: string }
        | { type: "checkpoint-score"; runId: string }
        | { type: "template-score"; runId: string }
      >()
      .notNull(),
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

export const aiTasks = sqliteTable(
  "ai_tasks",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id),
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id),
    input: text("input", { mode: "json" }).$type<JobAiInput>().notNull(),
    profile: text("profile", { mode: "json" }).$type<AiProfile>().notNull(),
    latestOperationId: text("latest_operation_id")
      .notNull()
      .references(() => operations.id),
    attempts: integer("attempts").notNull(),
    revision: integer("revision").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("ai_tasks_job").on(table.ownerId, table.jobId, table.createdAt)],
);
export const aiProposals = sqliteTable("ai_proposals", {
  id: text("id").primaryKey(),
  taskId: text("task_id")
    .notNull()
    .unique()
    .references(() => aiTasks.id),
  operationId: text("operation_id")
    .notNull()
    .references(() => operations.id),
  payload: text("payload", { mode: "json" }).$type<JobAiProposal>(),
  state: text("state").$type<"Pending" | "Accepted" | "Rejected">().notNull(),
  revision: integer("revision").notNull(),
  createdAt: integer("created_at").notNull(),
  reviewedAt: integer("reviewed_at"),
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

export const drafts = sqliteTable("drafts", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => user.id),
  revision: integer("revision").notNull().default(0),
  document: text("document", { mode: "json" }).$type<ResumeDocument>().notNull(),
  theme: text("theme").$type<Theme>().notNull(),
  updatedAt: integer("updated_at").notNull(),
});
export const references = sqliteTable(
  "draft_references",
  {
    draftId: text("draft_id")
      .notNull()
      .references(() => drafts.id),
    targetId: text("target_id").notNull(),
    revision: integer("revision").notNull(),
  },
  (table) => [uniqueIndex("draft_reference_unique").on(table.draftId, table.targetId)],
);

/** A failed guard aborts the entire D1 batch, including audit and reference writes. */
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
    mime: text("mime").$type<CreateSourceRequest["mime"]>().notNull(),
    kind: text("kind").$type<CreateSourceRequest["kind"]>().notNull(),
    provenanceUrl: text("provenance_url"),
    note: text("note").notNull(),
    digest: text("digest").notNull(),
    byteLength: integer("byte_length").notNull(),
    objectKey: text("object_key").notNull(),
    state: text("state").$type<"Uploading" | "Processing" | "Ready" | "Failed">().notNull(),
    revision: integer("revision").notNull().default(0),
    operationId: text("operation_id").notNull(),
    currentProcessingId: text("current_processing_id"),
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
export const sourceUploadChecks = sqliteTable("source_upload_checks", {
  sourceId: text("source_id")
    .primaryKey()
    .references(() => sources.id),
  checkedAt: integer("checked_at").notNull(),
});

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
    kind: text("kind").$type<ContextData["kind"]>().notNull(),
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
    data: text("data", { mode: "json" }).$type<ContextData>().notNull(),
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
    metadata: text("metadata", { mode: "json" }).$type<EvidenceMetadata>().notNull(),
    reviewState: text("review_state").$type<ReviewState>().notNull(),
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
    material: text("material", { mode: "json" }).$type<EvidenceMaterial>().notNull(),
    actorId: text("actor_id").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("evidence_revision_claim").on(table.claimId)],
);
export const citationReferences = sqliteTable(
  "evidence_citation_references",
  {
    revisionId: text("revision_id")
      .notNull()
      .references(() => evidenceRevisions.id),
    sourceId: text("source_id")
      .notNull()
      .references(() => sources.id),
    processingId: text("processing_id")
      .notNull()
      .references(() => processingResults.id),
  },
  (table) => [
    primaryKey({ columns: [table.revisionId, table.sourceId, table.processingId] }),
    index("citation_processing").on(table.processingId),
  ],
);
export const evidenceContexts = sqliteTable(
  "evidence_context_references",
  {
    revisionId: text("revision_id")
      .notNull()
      .references(() => evidenceRevisions.id),
    contextId: text("context_id")
      .notNull()
      .references(() => contexts.id),
    contextRevisionId: text("context_revision_id")
      .notNull()
      .references(() => contextRevisions.id),
  },
  (table) => [
    primaryKey({ columns: [table.revisionId, table.contextId] }),
    index("evidence_context_id").on(table.contextId),
  ],
);
export const reviewDecisions = sqliteTable(
  "evidence_review_decisions",
  {
    id: text("id").primaryKey(),
    claimId: text("claim_id")
      .notNull()
      .references(() => claims.id),
    revisionId: text("revision_id")
      .notNull()
      .references(() => evidenceRevisions.id),
    state: text("state").$type<ReviewState>().notNull(),
    rationale: text("rationale").notNull(),
    actorId: text("actor_id").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("review_evidence_revision").on(table.revisionId)],
);
export const duplicatePairs = sqliteTable(
  "evidence_duplicates",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id),
    firstId: text("first_id")
      .notNull()
      .references(() => claims.id),
    firstRevisionId: text("first_revision_id")
      .notNull()
      .references(() => evidenceRevisions.id),
    secondId: text("second_id")
      .notNull()
      .references(() => claims.id),
    secondRevisionId: text("second_revision_id")
      .notNull()
      .references(() => evidenceRevisions.id),
    similarity: integer("similarity").notNull(),
    state: text("state").$type<"Pending" | "Separate">().notNull(),
    revision: integer("revision").notNull().default(0),
    rationale: text("rationale"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    index("duplicate_owner_state").on(table.ownerId, table.state),
    uniqueIndex("duplicate_revision_pair").on(table.firstRevisionId, table.secondRevisionId),
  ],
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

export const jobWorkspaceRevisions = sqliteTable(
  "job_workspace_revisions",
  {
    id: text("id").primaryKey(),
    snapshotId: text("snapshot_id")
      .notNull()
      .references(() => jobSnapshots.id),
    data: text("data", { mode: "json" }).$type<JobWorkspace>().notNull(),
    actorId: text("actor_id").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("job_workspace_history").on(table.snapshotId, table.createdAt)],
);

export const jobWorkspaces = sqliteTable("job_workspaces", {
  snapshotId: text("snapshot_id")
    .primaryKey()
    .references(() => jobSnapshots.id),
  currentRevisionId: text("current_revision_id")
    .notNull()
    .references(() => jobWorkspaceRevisions.id),
});

export const jobEvidenceReferences = sqliteTable(
  "job_evidence_references",
  {
    workspaceRevisionId: text("workspace_revision_id")
      .notNull()
      .references(() => jobWorkspaceRevisions.id),
    claimId: text("claim_id")
      .notNull()
      .references(() => claims.id),
    evidenceRevisionId: text("evidence_revision_id")
      .notNull()
      .references(() => evidenceRevisions.id),
    association: text("association").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceRevisionId, table.claimId, table.association] }),
    index("job_evidence_revision").on(table.evidenceRevisionId),
  ],
);

export const libraryItems = sqliteTable(
  "library_items",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id),
    kind: text("kind").$type<LibraryKind>().notNull(),
    type: text("type").$type<ContentType>().notNull(),
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
    data: text("data", { mode: "json" }).$type<LibraryData>().notNull(),
    label: text("label").notNull(),
    rationale: text("rationale").notNull(),
    actorId: text("actor_id").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("library_revision_history").on(table.itemId, table.createdAt)],
);
export const libraryChildReferences = sqliteTable(
  "library_child_references",
  {
    revisionId: text("revision_id")
      .notNull()
      .references(() => libraryRevisions.id),
    childRevisionId: text("child_revision_id")
      .notNull()
      .references(() => libraryRevisions.id),
  },
  (table) => [
    primaryKey({ columns: [table.revisionId, table.childRevisionId] }),
    index("library_child_usage").on(table.childRevisionId),
  ],
);
export const libraryEvidenceReferences = sqliteTable(
  "library_evidence_references",
  {
    revisionId: text("revision_id")
      .notNull()
      .references(() => libraryRevisions.id),
    evidenceRevisionId: text("evidence_revision_id")
      .notNull()
      .references(() => evidenceRevisions.id),
  },
  (table) => [
    primaryKey({ columns: [table.revisionId, table.evidenceRevisionId] }),
    index("library_evidence_usage").on(table.evidenceRevisionId),
  ],
);

/** Structured working drafts are separate from the Phase 0 resolved-render fixture. */
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
    data: text("data", { mode: "json" }).$type<Composition>().notNull(),
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
export const resumeLibraryReferences = sqliteTable(
  "resume_library_references",
  {
    draftId: text("draft_id")
      .notNull()
      .references(() => resumeDrafts.id),
    revisionId: text("revision_id")
      .notNull()
      .references(() => libraryRevisions.id),
  },
  (table) => [
    primaryKey({ columns: [table.draftId, table.revisionId] }),
    index("resume_library_reverse").on(table.revisionId),
  ],
);
export const resumeEvidenceReferences = sqliteTable(
  "resume_evidence_references",
  {
    draftId: text("draft_id")
      .notNull()
      .references(() => resumeDrafts.id),
    revisionId: text("revision_id")
      .notNull()
      .references(() => evidenceRevisions.id),
  },
  (table) => [
    primaryKey({ columns: [table.draftId, table.revisionId] }),
    index("resume_evidence_reverse").on(table.revisionId),
  ],
);

/** Composition and historical material values are immutable; review state lives in separate records. */
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
    data: text("data", { mode: "json" }).$type<Composition>().notNull(),
    graph: text("graph", { mode: "json" }).$type<readonly LibraryGraphNode[]>().notNull(),
    evidence: text("evidence", { mode: "json" }).$type<readonly CapturedEvidence[]>().notNull(),
    document: text("document", { mode: "json" }).$type<ResumeDocument>().notNull(),
    templateIdentity: text("template_identity").notNull(),
    templateGraph: text("template_graph", { mode: "json" }).$type<TemplateGraph>(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("checkpoint_draft_history").on(table.ownerId, table.draftId, table.createdAt)],
);
export const resumeCheckpointBranches = sqliteTable("resume_checkpoint_branches", {
  draftId: text("draft_id")
    .primaryKey()
    .references(() => resumeDrafts.id),
  fromCheckpointId: text("from_checkpoint_id")
    .notNull()
    .references(() => checkpoints.id),
  structuredBaseId: text("structured_base_id")
    .notNull()
    .references(() => checkpoints.id),
});
/** Source overrides are immutable siblings of the retained structured checkpoint data. */
export const checkpointSources = sqliteTable("checkpoint_source_overrides", {
  checkpointId: text("checkpoint_id")
    .primaryKey()
    .references(() => checkpoints.id),
  baseCheckpointId: text("base_checkpoint_id")
    .notNull()
    .references(() => checkpoints.id),
  structuredBaseId: text("structured_base_id")
    .notNull()
    .references(() => checkpoints.id),
  proposalId: text("proposal_id").notNull().unique(),
  source: text("source").notNull(),
  fields: text("fields", { mode: "json" }).$type<SourceFields>().notNull(),
  candidateDigest: text("candidate_digest").notNull(),
  reviewDigest: text("review_digest").notNull(),
  baseTemplateIdentity: text("base_template_identity").notNull(),
});
export const sourceRefinementTasks = sqliteTable(
  "source_refinement_tasks",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id),
    baseCheckpointId: text("base_checkpoint_id")
      .notNull()
      .references(() => checkpoints.id),
    input: text("input", { mode: "json" }).$type<SourceRefinementInput>().notNull(),
    dependencies: text("dependencies", { mode: "json" }).$type<RefinementDependencies>().notNull(),
    profile: text("profile", { mode: "json" }).$type<SourceRefinementProfile>().notNull(),
    latestOperationId: text("latest_operation_id")
      .notNull()
      .references(() => operations.id),
    generationAttempts: integer("generation_attempts").notNull().default(1),
    previewAttempts: integer("preview_attempts").notNull().default(1),
    revision: integer("revision").notNull().default(0),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    index("source_refinement_checkpoint").on(
      table.ownerId,
      table.baseCheckpointId,
      table.createdAt,
    ),
  ],
);
export const sourceRefinementProposals = sqliteTable("source_refinement_proposals", {
  id: text("id").primaryKey(),
  taskId: text("task_id")
    .notNull()
    .unique()
    .references(() => sourceRefinementTasks.id),
  state: text("state").$type<"Pending" | "Accepted" | "Rejected">().notNull(),
  payload: text("payload", { mode: "json" }).$type<SourceRefinementCandidate>(),
  candidateDigest: text("candidate_digest").notNull(),
  comparison: text("comparison", { mode: "json" }).$type<SourceComparison>(),
  previewOperationId: text("preview_operation_id").references(() => operations.id),
  previewArtifacts: text("preview_artifacts", { mode: "json" }).$type<ArtifactManifest>(),
  reviewDigest: text("review_digest"),
  acceptanceOperationId: text("acceptance_operation_id").references(() => operations.id),
  acceptanceAttempts: integer("acceptance_attempts").notNull().default(0),
  resultCheckpointId: text("result_checkpoint_id"),
  createdAt: integer("created_at").notNull(),
  reviewedAt: integer("reviewed_at"),
});

export const sourceRefinementArtifactCleanup = sqliteTable("source_refinement_artifact_cleanup", {
  taskId: text("task_id")
    .primaryKey()
    .references(() => sourceRefinementTasks.id),
  createdAt: integer("created_at").notNull(),
  settleAfter: integer("settle_after").notNull(),
  lastAttemptAt: integer("last_attempt_at"),
  completedAt: integer("completed_at"),
});

export const checkpointReviews = sqliteTable("checkpoint_review_reports", {
  id: text("id").primaryKey(),
  checkpointId: text("checkpoint_id")
    .notNull()
    .references(() => checkpoints.id),
  digest: text("digest").notNull(),
  policyVersion: text("policy_version").notNull(),
  issues: text("issues", { mode: "json" }).$type<readonly ExportIssue[]>().notNull(),
  evidence: text("evidence", { mode: "json" }).$type<readonly EvidenceStatus[]>().notNull(),
  createdAt: integer("created_at").notNull(),
});
export const checkpointState = sqliteTable("checkpoint_state", {
  checkpointId: text("checkpoint_id")
    .primaryKey()
    .references(() => checkpoints.id),
  revision: integer("revision").notNull().default(0),
  reportId: text("report_id")
    .notNull()
    .references(() => checkpointReviews.id),
  operationId: text("operation_id")
    .notNull()
    .references(() => operations.id),
  attempts: integer("attempts").notNull().default(1),
});
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
    profile: text("profile", { mode: "json" }).$type<ScoringProfile>().notNull(),
    input: text("input", { mode: "json" }).$type<ScoringInput>(),
    result: text("result", { mode: "json" }).$type<ScoringResult>(),
    completedAt: integer("completed_at"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    index("scoring_checkpoint_history").on(table.ownerId, table.checkpointId, table.createdAt),
  ],
);
export const scoringAttempts = sqliteTable(
  "scoring_attempts",
  {
    operationId: text("operation_id")
      .primaryKey()
      .references(() => operations.id),
    runId: text("run_id")
      .notNull()
      .references(() => scoringRuns.id),
    ordinal: integer("ordinal").notNull(),
    observation: text("observation", { mode: "json" }).$type<ScoringObservation>(),
    submittedAt: integer("submitted_at"),
    failure: text("failure", { mode: "json" }).$type<ScoringFailure>(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [uniqueIndex("scoring_attempt_ordinal").on(table.runId, table.ordinal)],
);
export const scoringFindingDecisions = sqliteTable(
  "scoring_finding_decisions",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => scoringRuns.id),
    platform: text("platform").notNull(),
    findingIndex: integer("finding_index").notNull(),
    resultDigest: text("result_digest").notNull(),
    findingDigest: text("finding_digest").notNull(),
    revision: integer("revision").notNull(),
    outcome: text("outcome").$type<ScoringFindingOutcome>().notNull(),
    rationale: text("rationale").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("scoring_finding_decision").on(table.runId, table.platform, table.findingIndex),
  ],
);
export const checkpointAcknowledgments = sqliteTable(
  "checkpoint_acknowledgments",
  {
    reportId: text("report_id")
      .notNull()
      .references(() => checkpointReviews.id),
    issueId: text("issue_id").notNull(),
    actorId: text("actor_id").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.reportId, table.issueId] })],
);
export const checkpointExports = sqliteTable("checkpoint_exports", {
  checkpointId: text("checkpoint_id")
    .primaryKey()
    .references(() => checkpoints.id),
  reportId: text("report_id")
    .notNull()
    .references(() => checkpointReviews.id),
  operationId: text("operation_id")
    .notNull()
    .references(() => operations.id),
  digest: text("digest").notNull(),
  actorId: text("actor_id").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const wordingTasks = sqliteTable(
  "wording_tasks",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id),
    draftId: text("draft_id")
      .notNull()
      .references(() => resumeDrafts.id),
    input: text("input", { mode: "json" }).$type<WordingInput>().notNull(),
    draftRevision: integer("draft_revision").notNull(),
    profile: text("profile", { mode: "json" }).$type<WordingProfile>().notNull(),
    latestOperationId: text("latest_operation_id")
      .notNull()
      .references(() => operations.id),
    attempts: integer("attempts").notNull(),
    revision: integer("revision").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("wording_tasks_draft").on(table.ownerId, table.draftId, table.createdAt)],
);
export const wordingProposals = sqliteTable("wording_proposals", {
  id: text("id").primaryKey(),
  taskId: text("task_id")
    .notNull()
    .unique()
    .references(() => wordingTasks.id),
  operationId: text("operation_id")
    .notNull()
    .references(() => operations.id),
  digest: text("digest").notNull(),
  payload: text("payload", { mode: "json" }).$type<WordingProposal>(),
  state: text("state").$type<"Pending" | "Accepted" | "Rejected">().notNull(),
  revision: integer("revision").notNull(),
  createdAt: integer("created_at").notNull(),
  reviewedAt: integer("reviewed_at"),
  appliedRevision: integer("applied_revision"),
});

export const sourceAiTasks = sqliteTable(
  "source_ai_tasks",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id),
    sourceId: text("source_id")
      .notNull()
      .references(() => sources.id),
    input: text("input", { mode: "json" }).$type<SourceAiInput>().notNull(),
    profile: text("profile", { mode: "json" }).$type<SourceAiProfile>().notNull(),
    latestOperationId: text("latest_operation_id")
      .notNull()
      .references(() => operations.id),
    attempts: integer("attempts").notNull(),
    revision: integer("revision").notNull(),
    createdAt: integer("created_at").notNull(),
    completedAt: integer("completed_at"),
  },
  (table) => [index("source_ai_tasks_source").on(table.ownerId, table.sourceId, table.createdAt)],
);
export const sourceCandidates = sqliteTable(
  "source_ai_candidates",
  {
    id: text("id").primaryKey(),
    taskId: text("task_id")
      .notNull()
      .references(() => sourceAiTasks.id),
    operationId: text("operation_id")
      .notNull()
      .references(() => operations.id),
    ordinal: integer("ordinal").notNull(),
    digest: text("digest").notNull(),
    payload: text("payload", { mode: "json" }).$type<SourceCandidate>(),
    state: text("state").$type<"Pending" | "Accepted" | "Rejected">().notNull(),
    revision: integer("revision").notNull(),
    createdAt: integer("created_at").notNull(),
    reviewedAt: integer("reviewed_at"),
    claimId: text("claim_id").references(() => claims.id),
    evidenceRevisionId: text("evidence_revision_id").references(() => evidenceRevisions.id),
  },
  (table) => [uniqueIndex("source_ai_candidate_ordinal").on(table.taskId, table.ordinal)],
);
export const clarificationRequests = sqliteTable(
  "clarification_requests",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id),
    candidateId: text("candidate_id")
      .notNull()
      .references(() => sourceCandidates.id),
    claimId: text("claim_id")
      .notNull()
      .references(() => claims.id),
    evidenceRevisionId: text("evidence_revision_id")
      .notNull()
      .references(() => evidenceRevisions.id),
    question: text("question").notNull(),
    revision: integer("revision").notNull().default(0),
    answerSourceId: text("answer_source_id").references(() => sources.id),
    answerEvidenceRevisionId: text("answer_evidence_revision_id").references(
      () => evidenceRevisions.id,
    ),
    createdAt: integer("created_at").notNull(),
    answeredAt: integer("answered_at"),
  },
  (table) => [index("clarification_claim").on(table.ownerId, table.claimId)],
);

export const duplicateAiTasks = sqliteTable(
  "duplicate_ai_tasks",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id),
    pairId: text("pair_id")
      .notNull()
      .references(() => duplicatePairs.id),
    firstClaimId: text("first_claim_id")
      .notNull()
      .references(() => claims.id),
    secondClaimId: text("second_claim_id")
      .notNull()
      .references(() => claims.id),
    input: text("input", { mode: "json" }).$type<DuplicateAiInput>().notNull(),
    profile: text("profile", { mode: "json" }).$type<DuplicateAiProfile>().notNull(),
    latestOperationId: text("latest_operation_id")
      .notNull()
      .references(() => operations.id),
    attempts: integer("attempts").notNull(),
    revision: integer("revision").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    index("duplicate_ai_first").on(table.ownerId, table.firstClaimId, table.createdAt),
    index("duplicate_ai_second").on(table.ownerId, table.secondClaimId, table.createdAt),
  ],
);
export const duplicateAiProposals = sqliteTable("duplicate_ai_proposals", {
  id: text("id").primaryKey(),
  taskId: text("task_id")
    .notNull()
    .unique()
    .references(() => duplicateAiTasks.id),
  operationId: text("operation_id")
    .notNull()
    .references(() => operations.id),
  digest: text("digest").notNull(),
  payload: text("payload", { mode: "json" }).$type<DuplicateAiOutput>(),
  state: text("state").$type<"Pending" | "Accepted" | "Rejected">().notNull(),
  revision: integer("revision").notNull(),
  createdAt: integer("created_at").notNull(),
  reviewedAt: integer("reviewed_at"),
});

export const templateDesigns = sqliteTable(
  "template_designs",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id),
    name: text("name").notNull(),
    scope: text("scope", { mode: "json" }).$type<TemplateScope>().notNull(),
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
    graph: text("graph", { mode: "json" }).$type<TemplateGraph>().notNull(),
    digest: text("digest").notNull(),
    origins: text("origins", { mode: "json" }).$type<readonly TemplateOrigin[]>().notNull(),
    state: text("state").$type<TemplateLifecycle>().notNull().default("Draft"),
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
  report: text("report", { mode: "json" }).$type<TemplateValidationReport>(),
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
    result: text("result", { mode: "json" }).$type<TemplateFixtureResult>().notNull(),
  },
  (table) => [primaryKey({ columns: [table.validationId, table.fixtureId] })],
);

export const resumeTemplateReferences = sqliteTable(
  "resume_template_references",
  {
    draftId: text("draft_id")
      .primaryKey()
      .references(() => resumeDrafts.id),
    revisionId: text("revision_id")
      .notNull()
      .references(() => templateRevisions.id),
  },
  (table) => [index("resume_template_revision_idx").on(table.revisionId)],
);

export const templateAiTasks = sqliteTable(
  "template_ai_tasks",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id),
    name: text("name").notNull(),
    destinationId: text("destination_id").references(() => templateDesigns.id),
    destinationRevision: integer("destination_revision"),
    base: text("base", { mode: "json" }).$type<TemplateBase>().notNull(),
    dependency: text("dependency", { mode: "json" }).$type<TemplateDependency>(),
    input: text("input", { mode: "json" }).$type<TemplateAiInput>().notNull(),
    inputDigest: text("input_digest").notNull(),
    profile: text("profile", { mode: "json" }).$type<TemplateAiProfile>().notNull(),
    latestOperationId: text("latest_operation_id")
      .notNull()
      .references(() => operations.id),
    attempts: integer("attempts").notNull().default(1),
    revision: integer("revision").notNull().default(0),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    index("template_ai_owner").on(table.ownerId, table.createdAt),
    index("template_ai_destination").on(table.destinationId),
  ],
);
export const templateSourcePromotions = sqliteTable("template_source_promotions", {
  taskId: text("task_id")
    .primaryKey()
    .references(() => templateAiTasks.id),
  checkpointId: text("checkpoint_id")
    .notNull()
    .references(() => checkpoints.id),
  candidateDigest: text("candidate_digest").notNull(),
});
export const templateConversations = sqliteTable("template_conversations", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => user.id),
  revision: integer("revision").notNull().default(0),
  createdAt: integer("created_at").notNull(),
});
export const templateConversationTurns = sqliteTable(
  "template_conversation_turns",
  {
    taskId: text("task_id")
      .primaryKey()
      .references(() => templateAiTasks.id),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => templateConversations.id),
    position: integer("position").notNull(),
    instruction: text("instruction").notNull(),
  },
  (table) => [
    uniqueIndex("template_conversation_position").on(table.conversationId, table.position),
  ],
);
export const templateAiProposals = sqliteTable("template_ai_proposals", {
  id: text("id").primaryKey(),
  taskId: text("task_id")
    .notNull()
    .unique()
    .references(() => templateAiTasks.id),
  operationId: text("operation_id")
    .notNull()
    .references(() => operations.id),
  digest: text("digest").notNull(),
  payload: text("payload", { mode: "json" }).$type<TemplateCandidate>(),
  state: text("state").$type<"Pending" | "Accepted" | "Rejected">().notNull().default("Pending"),
  revision: integer("revision").notNull().default(0),
  previewOperationId: text("preview_operation_id").references(() => operations.id),
  previewDigest: text("preview_digest"),
  previewArtifacts: text("preview_artifacts", { mode: "json" }).$type<ArtifactManifest>(),
  previewAttempts: integer("preview_attempts").notNull().default(1),
  resultRevisionId: text("result_revision_id").references(() => templateRevisions.id),
  createdAt: integer("created_at").notNull(),
  reviewedAt: integer("reviewed_at"),
  previewCleanedAt: integer("preview_cleaned_at"),
});

export const templateScoringRuns = sqliteTable(
  "template_scoring_runs",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id),
    base: text("base", { mode: "json" }).$type<TemplateBase>().notNull(),
    graph: text("graph", { mode: "json" }).$type<TemplateGraph>().notNull(),
    graphDigest: text("graph_digest").notNull(),
    fixtureSet: text("fixture_set", { mode: "json" }).$type<AtsFixtureSet>().notNull(),
    profile: text("profile", { mode: "json" }).$type<ScoringProfile>().notNull(),
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

export const templateScoringAttempts = sqliteTable(
  "template_scoring_attempts",
  {
    operationId: text("operation_id")
      .primaryKey()
      .references(() => operations.id),
    runId: text("run_id")
      .notNull()
      .references(() => templateScoringRuns.id),
    ordinal: integer("ordinal").notNull(),
    report: text("report", { mode: "json" }).$type<TemplateScoringReport>(),
    reportDigest: text("report_digest"),
    failure: text("failure", { mode: "json" }).$type<ScoringFailure>(),
    createdAt: integer("created_at").notNull(),
    completedAt: integer("completed_at"),
  },
  (table) => [uniqueIndex("template_scoring_attempt_ordinal").on(table.runId, table.ordinal)],
);

export const templateScoringFixtures = sqliteTable(
  "template_scoring_fixtures",
  {
    runId: text("run_id")
      .notNull()
      .references(() => templateScoringRuns.id),
    fixtureId: text("fixture_id").notNull(),
    document: text("document", { mode: "json" }).$type<TemplateScoringDocument>(),
    documentDigest: text("document_digest"),
    rawResponseJson: text("raw_response_json"),
    resultDigest: text("result_digest"),
    resultOperationId: text("result_operation_id").references(() => operations.id),
    receivedAt: integer("received_at"),
  },
  (table) => [primaryKey({ columns: [table.runId, table.fixtureId] })],
);

export const templateScoringFixtureAttempts = sqliteTable(
  "template_scoring_fixture_attempts",
  {
    operationId: text("operation_id")
      .notNull()
      .references(() => templateScoringAttempts.operationId),
    fixtureId: text("fixture_id").notNull(),
    observation: text("observation", { mode: "json" }).$type<ScoringObservation>(),
    submittedAt: integer("submitted_at"),
    failure: text("failure", { mode: "json" }).$type<ScoringFailure>(),
  },
  (table) => [primaryKey({ columns: [table.operationId, table.fixtureId] })],
);

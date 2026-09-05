import { env } from "cloudflare:workers";
import type { DocumentJob, DocumentResult } from "@river/contracts";
import { Schema } from "effect";

export const Configuration = Schema.Struct({
  ENVIRONMENT: Schema.Literals(["development", "staging", "production"]),
  APP_URL: Schema.NonEmptyString,
  OWNER_EMAIL: Schema.NonEmptyString,
  AUTH_SECRET: Schema.String.check(Schema.isMinLength(32)),
  EMAIL_FROM: Schema.NonEmptyString,
  GITHUB_CLIENT_ID: Schema.optional(Schema.String),
  GITHUB_CLIENT_SECRET: Schema.optional(Schema.String),
  OPENAI_API_KEY: Schema.optional(Schema.NonEmptyString),
  OPENAI_REQUIREMENTS_MODEL: Schema.optional(Schema.NonEmptyString),
  OPENAI_SOURCE_CLAIMS_MODEL: Schema.optional(Schema.NonEmptyString),
  OPENAI_DUPLICATE_MODEL: Schema.optional(Schema.NonEmptyString),
  OPENAI_TEMPLATE_MODEL: Schema.optional(Schema.NonEmptyString),
  OPENAI_WORDING_MODEL: Schema.optional(Schema.NonEmptyString),
  OPENAI_RANKING_MODEL: Schema.optional(Schema.NonEmptyString),
  D1_EXPORT_API_TOKEN: Schema.optional(Schema.NonEmptyString),
  BACKUP_ACCOUNT_ID: Schema.optional(Schema.NonEmptyString),
  BACKUP_DATABASE_ID: Schema.optional(Schema.NonEmptyString),
  BACKUP_BUCKET_NAME: Schema.optional(Schema.NonEmptyString),
});
export type Configuration = typeof Configuration.Type;

export interface Env extends Configuration {
  DB: D1Database;
  ARTIFACTS: R2Bucket;
  DOCUMENT_WORKFLOW: Workflow<{ operationId: string }>;
  JOB_AI_WORKFLOW?: Workflow<{ operationId: string }>;
  SOURCE_AI_WORKFLOW?: Workflow<{ operationId: string }>;
  DUPLICATE_AI_WORKFLOW?: Workflow<{ operationId: string }>;
  TEMPLATE_VALIDATION_WORKFLOW?: Workflow<{ operationId: string }>;
  TEMPLATE_AI_WORKFLOW?: Workflow<{ operationId: string }>;
  WORDING_WORKFLOW?: Workflow<{ operationId: string }>;
  BACKUP_WORKFLOW?: Workflow<{ operationId: string }>;
  DOCUMENTS: { run: (job: DocumentJob) => Promise<DocumentResult> };
  EMAIL?: SendEmail;
}

type RiverBindings = Env;
declare global {
  namespace Cloudflare {
    interface Env extends RiverBindings {}
  }
}

export function bindings(): Env {
  Schema.decodeUnknownSync(Configuration)(env);
  const url = new URL(env.APP_URL);
  if (
    url.origin !== env.APP_URL ||
    (env.ENVIRONMENT !== "development" && url.protocol !== "https:")
  )
    throw new Error("APP_URL must be an origin, using HTTPS outside development.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.OWNER_EMAIL))
    throw new Error("OWNER_EMAIL must be a valid email address.");
  if (Boolean(env.GITHUB_CLIENT_ID) !== Boolean(env.GITHUB_CLIENT_SECRET))
    throw new Error("Configure both GitHub OAuth credentials together.");
  return env;
}

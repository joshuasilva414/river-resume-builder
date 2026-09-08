import { env } from "cloudflare:workers";
import type { DocumentJob, DocumentResult } from "@river/contracts";
import { Schema } from "effect";

export const Configuration = Schema.Struct({
  ENVIRONMENT: Schema.Literals(["development", "staging", "production"]),
  APP_URL: Schema.NonEmptyString,
  ADMIN_EMAIL: Schema.NonEmptyString,
  ALLOWED_EMAILS: Schema.optional(Schema.String),
  AUTH_SECRET: Schema.String.check(Schema.isMinLength(32)),
  EMAIL_FROM: Schema.NonEmptyString,
  GITHUB_CLIENT_ID: Schema.optional(Schema.String),
  GITHUB_CLIENT_SECRET: Schema.optional(Schema.String),
  AI_CREDENTIAL_ENCRYPTION_KEY: Schema.optional(
    Schema.String.check(Schema.isPattern(/^[a-fA-F0-9]{64}$/)),
  ),
  ATS_SCREENER_ORIGIN: Schema.optional(Schema.NonEmptyString),
  D1_EXPORT_API_TOKEN: Schema.optional(Schema.NonEmptyString),
  BACKUP_ACCOUNT_ID: Schema.optional(Schema.NonEmptyString),
  BACKUP_DATABASE_ID: Schema.optional(Schema.NonEmptyString),
  BACKUP_BUCKET_NAME: Schema.optional(Schema.NonEmptyString),
});
export type Configuration = typeof Configuration.Type;

export interface Env extends Configuration {
  DB: D1Database;
  BROWSER?: BrowserRun;
  ARTIFACTS: R2Bucket;
  DOCUMENT_WORKFLOW: Workflow<{ operationId: string }>;
  JOB_AI_WORKFLOW?: Workflow<{ operationId: string }>;
  SOURCE_AI_WORKFLOW?: Workflow<{ operationId: string }>;
  DUPLICATE_AI_WORKFLOW?: Workflow<{ operationId: string }>;
  TEMPLATE_VALIDATION_WORKFLOW?: Workflow<{ operationId: string }>;
  TEMPLATE_AI_WORKFLOW?: Workflow<{ operationId: string }>;
  SOURCE_REFINEMENT_WORKFLOW?: Workflow<{ operationId: string }>;
  WORDING_WORKFLOW?: Workflow<{ operationId: string }>;
  BACKUP_WORKFLOW?: Workflow<{ operationId: string }>;
  TEMPLATE_SCORING_WORKFLOW?: Workflow<{ operationId: string }>;
  SCORING_WORKFLOW?: Workflow<{ operationId: string }>;
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
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.ADMIN_EMAIL))
    throw new Error("ADMIN_EMAIL must be a valid email address.");
  if (
    env.ALLOWED_EMAILS?.split(",")
      .filter((email) => email.trim().length > 0)
      .some((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
  )
    throw new Error("ALLOWED_EMAILS must contain comma-separated email addresses.");
  if (env.ATS_SCREENER_ORIGIN) {
    const provider = new URL(env.ATS_SCREENER_ORIGIN);
    if (
      provider.origin !== env.ATS_SCREENER_ORIGIN ||
      provider.protocol !== "https:" ||
      provider.username ||
      provider.password
    )
      throw new Error("ATS_SCREENER_ORIGIN must be an HTTPS origin without credentials or a path.");
  }
  if (Boolean(env.GITHUB_CLIENT_ID) !== Boolean(env.GITHUB_CLIENT_SECRET))
    throw new Error("Configure both GitHub OAuth credentials together.");
  return env;
}

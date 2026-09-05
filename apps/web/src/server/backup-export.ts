import { createHash } from "node:crypto";
import { type BackupObject, fingerprint } from "@river/domain";
import { Schema } from "effect";
import backupTargets from "../../../../config/backup-resources.json";
import type { Env } from "./env";

export { backupTargets };
export type BackupEnvironment = keyof typeof backupTargets;

/** Match the whole resource tuple so a mixed environment can never export another database. */
export function backupEnvironment(
  env: Pick<Env, "ENVIRONMENT" | "BACKUP_ACCOUNT_ID" | "BACKUP_DATABASE_ID" | "BACKUP_BUCKET_NAME">,
): BackupEnvironment | null {
  if (env.ENVIRONMENT === "development") return null;
  const target = backupTargets[env.ENVIRONMENT];
  return env.BACKUP_ACCOUNT_ID === target.accountId &&
    env.BACKUP_DATABASE_ID === target.databaseId &&
    env.BACKUP_BUCKET_NAME === target.bucket
    ? env.ENVIRONMENT
    : null;
}

export function backupConfigured(env: Env) {
  return backupEnvironment(env) !== null && Boolean(env.D1_EXPORT_API_TOKEN && env.BACKUP_WORKFLOW);
}

const ExportResponse = Schema.Struct({
  success: Schema.Boolean,
  result: Schema.Struct({
    success: Schema.Boolean,
    status: Schema.String,
    at_bookmark: Schema.optional(Schema.String),
    result: Schema.optional(Schema.Struct({ signed_url: Schema.optional(Schema.String) })),
  }),
});
const MAX_SQL_BYTES = 64 * 1024 * 1024;
const fallbackFailure =
  "Daily export, schema verification, or private artifact retention failed. Inspect the attempt and the operator restore procedure before retrying.";

/** Only fixed diagnostic vocabulary may leave a backup Workflow; provider messages can contain SQL or signed URLs. */
export function safeBackupFailure(error: unknown) {
  if (!(error instanceof Error)) return fallbackFailure;
  const transfer =
    /^The database backup download or immutable upload failed at (download-url|download-request|download-response-[1-5]\d{2}|bounded-content-length|hash-stream|fixed-length-stream|immutable-r2-upload|verify-upload-length)\. No backup completion was recorded\.$/;
  const known = [
    "The D1 export request failed. Check the dedicated token and personal staging resources.",
    "The D1 export request failed. Check the dedicated token and configured River resources.",
    "D1 could not complete the database export.",
    "D1 export exceeded its 60-poll limit.",
    "Schema changed during backup; retry must capture the new schema.",
    "Daily backup settings are unavailable.",
  ];
  return transfer.test(error.message) || known.includes(error.message)
    ? error.message
    : fallbackFailure;
}

/** Hash while streaming. SQL never becomes Workflow step output or a large in-memory string. */
async function hashStoredObject(bucket: R2Bucket, key: string): Promise<BackupObject | null> {
  const object = await bucket.get(key);
  if (!object) return null;
  const hash = createHash("sha256");
  let bytes = 0;
  for await (const chunk of object.body) {
    bytes += chunk.byteLength;
    if (bytes > MAX_SQL_BYTES) throw new Error("Database backup exceeds its 64 MiB limit.");
    hash.update(chunk);
  }
  if (!bytes) throw new Error("Database backup is empty.");
  return { key, bytes, sha256: hash.digest("hex") };
}

export async function exportDatabase({
  environment,
  token,
  tables,
  key,
  bucket,
  transport = fetch,
  pause = (ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
}: {
  environment: BackupEnvironment;
  token: string;
  tables: readonly string[];
  key: string;
  bucket: R2Bucket;
  transport?: typeof fetch;
  pause?: (ms: number) => Promise<void>;
}): Promise<BackupObject> {
  if (!key.startsWith(`backups/database/${environment}/`))
    throw new Error("Backup object prefix does not match its environment.");
  const backupResources = backupTargets[environment];
  const existing = await hashStoredObject(bucket, key);
  if (existing) return existing;
  if (!tables.length || tables.some((table) => !/^[a-z_]+$/.test(table)))
    throw new Error("Invalid database table catalog.");
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${backupResources.accountId}/d1/database/${backupResources.databaseId}/export`;
  let bookmark: string | undefined;
  for (let attempt = 0; attempt < 60; attempt++) {
    let result: (typeof ExportResponse.Type)["result"];
    try {
      const response = await transport(endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          output_format: "polling",
          dump_options: { no_schema: true, no_data: false, tables },
          ...(bookmark ? { current_bookmark: bookmark } : {}),
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error("Export request failed");
      const parsed = Schema.decodeUnknownSync(ExportResponse)(await response.json());
      if (!parsed.success || !parsed.result.success) throw new Error("Export request failed");
      result = parsed.result;
    } catch {
      // API diagnostics can include SQL, credentials, or signed URLs. Deliberately omit the original error.
      throw new Error(
        "The D1 export request failed. Check the dedicated token and configured River resources.",
      );
    }
    if (result.status === "complete") {
      let stage = "download-url";
      try {
        const url = new URL(result.result?.signed_url ?? "");
        if (url.protocol !== "https:" || url.username || url.password)
          throw new Error("Invalid download URL");
        stage = "download-request";
        const response = await transport(url, {
          // Reject 3xx below without forwarding this signed request to another origin.
          redirect: "manual",
          headers: { "Accept-Encoding": "identity" },
          signal: AbortSignal.timeout(30_000),
        });
        stage = `download-response-${response.status}`;
        if (!response.ok || !response.body) throw new Error("Backup download failed");
        stage = "bounded-content-length";
        const expectedBytes = Number(response.headers.get("content-length"));
        if (
          !Number.isSafeInteger(expectedBytes) ||
          expectedBytes <= 0 ||
          expectedBytes > MAX_SQL_BYTES
        )
          throw new Error("Backup download has no valid bounded length");
        stage = "hash-stream";
        let bytes = 0;
        const hash = createHash("sha256");
        const body = response.body.pipeThrough(
          new TransformStream<Uint8Array, Uint8Array>({
            transform(chunk, controller) {
              bytes += chunk.byteLength;
              if (bytes > MAX_SQL_BYTES) throw new Error("Backup exceeds byte limit");
              hash.update(chunk);
              controller.enqueue(chunk);
            },
            flush() {
              if (!bytes) throw new Error("Empty backup");
            },
          }),
        );
        // R2 requires a known-length stream. A transform alone loses the upstream HTTP length.
        stage = "fixed-length-stream";
        const fixed = new FixedLengthStream(expectedBytes),
          abort = new AbortController();
        const transferred = body.pipeTo(fixed.writable, { signal: abort.signal }).then(
          () => true,
          () => false,
        );
        try {
          stage = "immutable-r2-upload";
          const object = await bucket.put(key, fixed.readable, {
            onlyIf: { etagDoesNotMatch: "*" },
            httpMetadata: { contentType: "application/sql" },
          });
          if (!object) {
            abort.abort();
            const raced = await hashStoredObject(bucket, key);
            if (!raced) throw new Error("Concurrent backup write missing");
            return raced;
          }
          stage = "verify-upload-length";
          if (!(await transferred) || bytes !== expectedBytes)
            throw new Error("Incomplete backup download");
          return { key, bytes, sha256: hash.digest("hex") };
        } finally {
          abort.abort();
          await transferred;
        }
      } catch {
        throw new Error(
          `The database backup download or immutable upload failed at ${stage}. No backup completion was recorded.`,
        );
      }
    }
    if (result.status === "error" || !result.at_bookmark)
      throw new Error("D1 could not complete the database export.");
    bookmark = result.at_bookmark;
    await pause(1000);
  }
  throw new Error("D1 export exceeded its 60-poll limit.");
}

export async function retainBackupManifest(
  bucket: R2Bucket,
  key: string,
  content: string,
): Promise<BackupObject> {
  const bytes = new TextEncoder().encode(content),
    sha256 = await fingerprint(bytes);
  const object = await bucket.put(key, bytes, {
    onlyIf: { etagDoesNotMatch: "*" },
    httpMetadata: { contentType: "application/json" },
    customMetadata: { sha256 },
  });
  if (!object) {
    const previous = await bucket.get(key);
    if (!previous || (await fingerprint(new Uint8Array(await previous.arrayBuffer()))) !== sha256)
      throw new Error("The immutable backup manifest differs from this execution.");
  }
  return { key, sha256, bytes: bytes.byteLength };
}

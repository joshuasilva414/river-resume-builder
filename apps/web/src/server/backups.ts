import type { ReadBackupStatusRequest, RetryBackupRequest } from "@river/contracts";
import type { Repository } from "@river/db";
import { BackupExport, fingerprint } from "@river/domain";
import { Effect, Schema } from "effect";
import { backupConfigured, safeBackupFailure } from "./backup-export";
import type { Env } from "./env";
import { Actor, attempt, Store } from "./services";

export const readBackupStatus = (env: Env, input: ReadBackupStatusRequest) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    const { retainedCandidates, ...status } = yield* attempt(() =>
      store.readBackupStatus(actor, input),
    );
    const retained = yield* attempt(() => retainedBackupStatus(env.ARTIFACTS, retainedCandidates));
    return {
      ...status,
      attempts: status.attempts.map((item) => ({
        ...item,
        failure: item.failure ? safeBackupFailure(new Error(item.failure)) : null,
      })),
      retained,
      configured: backupConfigured(env),
    };
  });

/** A completed database row alone does not prove that its expiring R2 artifacts remain available. */
export async function retainedBackupStatus(
  bucket: R2Bucket,
  candidates: Awaited<ReturnType<Repository["readBackupStatus"]>>["retainedCandidates"],
) {
  for (const candidate of candidates) {
    if (!candidate.manifest || !candidate.completedAt) continue;
    const object = await bucket.get(candidate.manifest.key);
    if (!object || object.size !== candidate.manifest.bytes || object.size > 2 * 1024 * 1024)
      continue;
    const text = await object.text();
    if ((await fingerprint(text)) !== candidate.manifest.sha256) continue;
    let manifest: BackupExport;
    try {
      manifest = Schema.decodeUnknownSync(BackupExport)(JSON.parse(text));
    } catch {
      continue;
    }
    const data = await bucket.head(manifest.data.key);
    if (!data || data.size !== manifest.data.bytes) continue;
    const expiresAt =
      Math.min(object.uploaded.getTime(), data.uploaded.getTime()) + 30 * 86_400_000;
    if (expiresAt <= Date.now()) continue;
    return {
      date: candidate.date,
      completedAt: candidate.completedAt,
      expiresAt,
      format: manifest.format,
      bytes: manifest.data.bytes,
      sha256: manifest.data.sha256,
    };
  }
  return null;
}

export const retryBackup = (env: Env, input: RetryBackupRequest) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    return yield* attempt(() => store.retryBackup(actor, input, backupConfigured(env)));
  });

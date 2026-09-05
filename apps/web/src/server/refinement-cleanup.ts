import { createRepository } from "@river/db";
import type { Env } from "./env";

/** Rejection persists cleanup with its decision. Repeat deletion after bounded in-flight writes have settled. */
export async function cleanRejectedSourceRefinements(env: Pick<Env, "DB" | "ARTIFACTS">) {
  const store = createRepository(env.DB);
  for (const row of await store.sourceRefinementCleanupCandidates()) {
    let complete = false;
    try {
      let listedAll = true;
      for (const prefix of [
        `transient/source-proposals/${row.taskId}/`,
        ...(row.checkpointId ? [`retained/checkpoints/${row.checkpointId}/`] : []),
      ]) {
        const objects = await env.ARTIFACTS.list({ prefix, limit: 100 });
        if (objects.objects.length)
          await env.ARTIFACTS.delete(objects.objects.map((object) => object.key));
        if (objects.truncated) listedAll = false;
      }
      complete = listedAll;
    } finally {
      await store.recordSourceRefinementCleanup(row.taskId, complete);
    }
  }
}

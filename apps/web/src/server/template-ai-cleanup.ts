import { createRepository } from "@river/db";
import type { Env } from "./env";

/** Retry removal of rejected candidate objects, including interrupted writes that have no D1 manifest. */
export async function cleanRejectedTemplatePreviews(env: Pick<Env, "DB" | "ARTIFACTS">) {
  const repository = createRepository(env.DB);
  for (const row of await repository.rejectedTemplatePreviews()) {
    const objects = await env.ARTIFACTS.list({
      prefix: `transient/template-proposals/${row.taskId}/`,
      limit: 100,
    });
    if (objects.objects.length)
      await env.ARTIFACTS.delete(objects.objects.map((object) => object.key));
    await repository.markTemplatePreviewCleaned(row.taskId);
  }
}

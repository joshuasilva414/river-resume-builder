import { ApplicationError, canonicalJson, scoringPreflight, scoringProfile } from "@river/domain";
import {
  type ContentNode,
  identitySchema,
  parseResume,
  parseTemplate,
  resolveDocument,
  resumeSchema,
  validateRenderedText,
  visualTemplateSchema,
} from "@river/domain/workspace";
import { Effect } from "effect";
import { z } from "zod";
import type { Env } from "./env";
import { inspectScoringProvider, scoreCheckpointText } from "./scoring-provider";
import { Actor, attempt, Store } from "./services";

const sample = z.object({
  name: z.string().min(1).max(160),
  resume: resumeSchema,
  text: z.string().max(500000),
  renderer: z.string().max(160),
  fonts: z.string().max(500),
  mapped: z.literal(true),
});
const common = { documentId: identitySchema, idempotencyKey: z.string().min(1).max(128) };
export const workspaceScoreSchema = z.discriminatedUnion("kind", [
  z.object({ ...common, kind: z.literal("resume-score"), sample }),
  z.object({
    ...common,
    kind: z.literal("template-score"),
    template: visualTemplateSchema,
    samples: z.array(sample).length(3),
  }),
]);
export type WorkspaceScoreRequest = z.infer<typeof workspaceScoreSchema>;
/** Optional text feedback. No save/export code path depends on this provider. */
export const scoreWorkspace = (
  env: Env,
  input: WorkspaceScoreRequest,
  transport: typeof fetch = fetch,
) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    return yield* attempt(async () => {
      const document = await store.getWorkspaceRecord(actor.ownerId, input.documentId);
      if (document.kind !== (input.kind === "resume-score" ? "resume" : "template"))
        throw new ApplicationError({ code: "NotFound", message: "Document unavailable." });
      if (!env.ATS_SCREENER_ORIGIN)
        throw new ApplicationError({
          code: "Unavailable",
          message: "Scoring is not configured. Saving and PDF export remain available.",
        });
      const samples = input.kind === "resume-score" ? [input.sample] : input.samples;
      if (input.kind === "template-score") parseTemplate(input.template);
      const noOrigins = (nodes: ContentNode[]): boolean =>
        nodes.every((node) =>
          node.kind === "group" ? noOrigins(node.children) : node.factIds.length === 0,
        );
      for (const sample of samples) {
        const resume = parseResume(sample.resume);
        if (
          input.kind === "template-score" &&
          (canonicalJson(resume.template.document) !== canonicalJson(input.template) ||
            !noOrigins([...resume.sections, ...resume.unused]))
        )
          throw new ApplicationError({
            code: "InvalidInput",
            message:
              "Each fictional fixture must use this exact template and have no candidate fact references.",
          });
        if (input.kind === "resume-score" && resume.job)
          await store.getWorkspaceJob(actor.ownerId, resume.job.id);
        if (!resume.job || !scoringPreflight(sample.text, resume.job.description).allowed)
          throw new ApplicationError({
            code: "InvalidInput",
            message:
              "Scoring needs complete résumé text (up to 6,000 characters) and a captured job description (up to 4,000). Inputs are never silently truncated.",
          });
        if (!validateRenderedText(resolveDocument(resume).expectedText, sample.text).ok)
          throw new ApplicationError({
            code: "InvalidInput",
            message:
              "The rendered text is stale or incomplete. Generate a current PDF before scoring.",
          });
      }
      const request = {
        idempotencyKey: input.idempotencyKey,
        kind: input.kind,
        targetId: input.documentId,
        input: canonicalJson(input),
      };
      const replay = await store.replayCommand(
        actor.id,
        "workspace.run",
        input.idempotencyKey,
        request,
      );
      if (replay) return store.getWorkspaceRun(actor.ownerId, replay.id);
      const run = await store.beginWorkspaceRun(actor, request);
      let metadata: string | null = null;
      try {
        const profile = scoringProfile(env.ATS_SCREENER_ORIGIN),
          version = await inspectScoringProvider(profile, transport);
        metadata = canonicalJson({
          profile,
          version,
          rendering: samples.map((sample) => ({
            name: sample.name,
            renderer: sample.renderer,
            fonts: sample.fonts,
          })),
        });
        // Three bounded calls share the captured fixture set and one retained scorecard.
        const results = await Promise.all(
          samples.map(async (sample) => ({
            name: sample.name,
            ...(await scoreCheckpointText(
              profile,
              { resumeText: sample.text, jobDescription: sample.resume.job?.description ?? "" },
              version,
              transport,
            )),
          })),
        );
        return store.finishWorkspaceRun(actor.ownerId, run.id, {
          result: canonicalJson({ results }),
          metadata,
        });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Scoring failed. Saving and PDF export remain available.";
        return store.finishWorkspaceRun(actor.ownerId, run.id, { error: message, metadata });
      }
    });
  });

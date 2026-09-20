import { z } from "zod";
import {
  candidateFactSchema,
  contentItemSchema,
  factContextSchema,
  identitySchema,
  resumeSchema,
  visualTemplateSchema,
} from "./model";
import { assertContent, parseResume, parseTemplate } from "./validation";

export const savedVersionSchema = z.object({
  version: z.literal(1),
  name: z.string().min(1).max(240),
  resumeId: identitySchema,
  draftRevision: z.number().int().nonnegative(),
  snapshot: resumeSchema,
});
export const workspacePayloadSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("context"), data: factContextSchema }),
  z.object({ kind: z.literal("fact"), data: candidateFactSchema }),
  z.object({ kind: z.literal("content"), data: contentItemSchema }),
  z.object({ kind: z.literal("template"), data: visualTemplateSchema }),
  z.object({ kind: z.literal("resume"), data: resumeSchema }),
  z.object({ kind: z.literal("version"), data: savedVersionSchema }),
]);
export const recordKindSchema = z.enum([
  "context",
  "fact",
  "content",
  "template",
  "resume",
  "version",
]);
export type RecordKind = z.infer<typeof recordKindSchema>;
export type WorkspacePayload = z.infer<typeof workspacePayloadSchema>;
export type WorkspaceRecord = WorkspacePayload & {
  id: string;
  revision: number;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
};
export const saveRecordSchema = z.object({
  id: identitySchema,
  revision: z.number().int().nonnegative(),
  idempotencyKey: z.string().min(1).max(128),
  payload: workspacePayloadSchema,
});
export type SaveRecord = z.infer<typeof saveRecordSchema>;
export const deleteRecordSchema = saveRecordSchema.omit({ payload: true });
export type DeleteRecord = z.infer<typeof deleteRecordSchema>;
export const importFactsSchema = z.object({
  idempotencyKey: z.string().min(1).max(128),
  contexts: z.array(factContextSchema).max(100),
  facts: z.array(candidateFactSchema).min(1).max(500),
});
export type ImportFacts = z.infer<typeof importFactsSchema>;
export const exportMetadataSchema = z.object({
  renderer: z.string().min(1).max(160),
  fonts: z.string().min(1).max(500),
  text: z.string().max(500000),
  pages: z.number().int().min(1).max(200),
  digest: z.string().regex(/^[a-f0-9]{64}$/),
  byteLength: z
    .number()
    .int()
    .min(1)
    .max(25 * 1024 * 1024),
  warnings: z.array(z.string().max(1000)).max(1000),
});
export type ExportMetadata = z.infer<typeof exportMetadataSchema>;
export function parseWorkspacePayload(input: unknown): WorkspacePayload {
  const payload = workspacePayloadSchema.parse(input);
  if (payload.kind === "template") parseTemplate(payload.data);
  if (payload.kind === "resume") parseResume(payload.data);
  if (payload.kind === "version") parseResume(payload.data.snapshot);
  if (payload.kind === "content") assertContent([payload.data.content]);
  return payload;
}
export function recordName(payload: WorkspacePayload) {
  return "name" in payload.data ? payload.data.name : payload.data.label;
}

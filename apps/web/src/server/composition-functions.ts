import {
  ApplyLibraryRequest,
  BranchResumeRequest,
  CopyPlacementRequest,
  CreateResumeRequest,
  InspectResumeRequest,
  PreviewResumeRequest,
  ResumeSearch,
  SaveResumeRequest,
} from "@river/contracts";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { Schema } from "effect";
import {
  applyLibraryUpdate,
  branchResume,
  copyPlacement,
  createResume,
  inspectResume,
  previewResume,
  saveResume,
  searchResumes,
} from "./composition";
import { bindings } from "./env";
import { dispatchPending, execute } from "./services";
export const getResumes = createServerFn({ method: "GET" })
  .validator(Schema.decodeUnknownSync(ResumeSearch))
  .handler(({ data }) => execute(bindings(), getRequestHeaders(), searchResumes(data)));
export const getResume = createServerFn({ method: "GET" })
  .validator(Schema.decodeUnknownSync(InspectResumeRequest))
  .handler(({ data }) => execute(bindings(), getRequestHeaders(), inspectResume(data.id)));
export const addResume = createServerFn({ method: "POST" })
  .validator(Schema.decodeUnknownSync(CreateResumeRequest))
  .handler(({ data }) => execute(bindings(), getRequestHeaders(), createResume(data)));
export const updateResume = createServerFn({ method: "POST" })
  .validator(Schema.decodeUnknownSync(SaveResumeRequest))
  .handler(({ data }) => execute(bindings(), getRequestHeaders(), saveResume(data)));
export const forkResume = createServerFn({ method: "POST" })
  .validator(Schema.decodeUnknownSync(BranchResumeRequest))
  .handler(({ data }) => execute(bindings(), getRequestHeaders(), branchResume(data)));
export const copyResumePlacement = createServerFn({ method: "POST" })
  .validator(Schema.decodeUnknownSync(CopyPlacementRequest))
  .handler(({ data }) => execute(bindings(), getRequestHeaders(), copyPlacement(data)));
export const requestResumePreview = createServerFn({ method: "POST" })
  .validator(Schema.decodeUnknownSync(PreviewResumeRequest))
  .handler(async ({ data }) => {
    const env = bindings(),
      result = await execute(env, getRequestHeaders(), previewResume(data));
    if (result.ok) await dispatchPending(env).catch(() => {});
    return result;
  });

export const applyResumeLibraryUpdate = createServerFn({ method: "POST" })
  .validator(Schema.decodeUnknownSync(ApplyLibraryRequest))
  .handler(({ data }) => execute(bindings(), getRequestHeaders(), applyLibraryUpdate(data)));

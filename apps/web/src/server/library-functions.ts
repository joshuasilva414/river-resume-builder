import {
  CreateLibraryStarterRequest,
  InspectLibraryRequest,
  LibrarySearch,
  SaveLibraryRequest,
  SetLibraryArchivedRequest,
} from "@river/contracts";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { Schema } from "effect";
import { bindings } from "./env";
import {
  createLibraryStarter,
  inspectLibrary,
  saveLibrary,
  searchLibrary,
  setLibraryArchived,
} from "./library";
import { execute } from "./services";
export const getLibrary = createServerFn({ method: "GET" })
  .validator(Schema.decodeUnknownSync(LibrarySearch))
  .handler(({ data }) => execute(bindings(), getRequestHeaders(), searchLibrary(data)));
export const getLibraryDetail = createServerFn({ method: "GET" })
  .validator(Schema.decodeUnknownSync(InspectLibraryRequest))
  .handler(({ data }) => execute(bindings(), getRequestHeaders(), inspectLibrary(data)));
export const mutateLibrary = createServerFn({ method: "POST" })
  .validator(Schema.decodeUnknownSync(SaveLibraryRequest))
  .handler(({ data }) => execute(bindings(), getRequestHeaders(), saveLibrary(data)));
export const archiveLibrary = createServerFn({ method: "POST" })
  .validator(Schema.decodeUnknownSync(SetLibraryArchivedRequest))
  .handler(({ data }) => execute(bindings(), getRequestHeaders(), setLibraryArchived(data)));

export const addLibraryStarter = createServerFn({ method: "POST" })
  .validator(Schema.decodeUnknownSync(CreateLibraryStarterRequest))
  .handler(({ data }) => execute(bindings(), getRequestHeaders(), createLibraryStarter(data)));

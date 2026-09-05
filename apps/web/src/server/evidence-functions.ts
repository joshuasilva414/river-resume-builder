import { EvidenceCommand, EvidenceIdentity, EvidenceSearch } from "@river/contracts";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { Schema } from "effect";
import { bindings } from "./env";
import {
  evidencePermissions,
  inspectEvidence,
  listContexts,
  listDuplicates,
  runEvidenceCommand,
  searchEvidence,
} from "./evidence";
import { execute } from "./services";
export const getEvidence = createServerFn({ method: "GET" })
  .validator(Schema.decodeUnknownSync(EvidenceSearch))
  .handler(({ data }) =>
    execute(bindings(), getRequestHeaders(), searchEvidence(data), "evidence:read"),
  );
export const getEvidenceDetail = createServerFn({ method: "GET" })
  .validator(Schema.decodeUnknownSync(EvidenceIdentity))
  .handler(({ data }) =>
    execute(bindings(), getRequestHeaders(), inspectEvidence(data.id), "evidence:read"),
  );
export const getContexts = createServerFn({ method: "GET" }).handler(() =>
  execute(bindings(), getRequestHeaders(), listContexts, "evidence:read"),
);
export const getDuplicates = createServerFn({ method: "GET" }).handler(() =>
  execute(bindings(), getRequestHeaders(), listDuplicates, "evidence:read"),
);
export const mutateEvidence = createServerFn({ method: "POST" })
  .validator(Schema.decodeUnknownSync(EvidenceCommand))
  .handler(({ data }) =>
    execute(
      bindings(),
      getRequestHeaders(),
      runEvidenceCommand(bindings(), data),
      evidencePermissions[data.type],
    ),
  );

import { WorkerEntrypoint } from "cloudflare:workers";
import { Container } from "@cloudflare/containers";
import { DocumentJob, DocumentResult } from "@river/contracts";
import { Effect, Logger, Schema } from "effect";
import runtimeContract from "../runtime-contract.json";

interface Env {
  CONTAINER: DurableObjectNamespace<DocumentContainer>;
}

export class DocumentContainer extends Container<Env> {
  defaultPort = 8080;
  pingEndpoint = "container/healthz";
  sleepAfter = "2m";
  enableInternet = false;

  /** Own both HTTP body streams in the Container request context; RPC carries plain data only. */
  async runDocument(input: unknown): Promise<DocumentResult> {
    const job = Schema.decodeUnknownSync(DocumentJob)(input);
    await this.startAndWaitForPorts({
      ports: 8080,
      cancellationOptions: { instanceGetTimeoutMS: 30_000, portReadyTimeoutMS: 30_000 },
    });
    const response = await this.containerFetch(
      new Request("http://container/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(job),
        signal: AbortSignal.timeout(100_000),
      }),
    );
    const cache = response.headers.get("X-River-Document-Cache");
    await Effect.runPromise(
      Effect.logInfo("river.document.response").pipe(
        Effect.annotateLogs({
          operationId: /^[a-f0-9-]{36}$/.test(job.jobId) ? job.jobId : "fixture",
          jobType: job.type,
          status: response.status,
          cache: cache === "hit" || cache === "miss" || cache === "bypass" ? cache : "unidentified",
        }),
        Effect.provide(Logger.layer([Logger.consoleJson, Logger.tracerLogger])),
      ),
    );
    if (!response.ok) {
      const reportedStage = response.headers.get("X-River-Document-Stage");
      const stage =
        reportedStage && Object.hasOwn(runtimeContract.stages, reportedStage)
          ? reportedStage
          : "unknown";
      const protocol =
        response.headers.get("X-River-Document-Protocol") === runtimeContract.protocol
          ? runtimeContract.protocol
          : "unidentified";
      await response.body?.cancel();
      throw new Error(
        `Document runtime failed with status ${response.status}; protocol=${protocol}; stage=${stage}`,
      );
    }
    return Schema.decodeUnknownSync(DocumentResult)(await response.json());
  }
}

/** Service-binding-only transport. The document worker has no public job endpoint. */
export class DocumentService extends WorkerEntrypoint<Env> {
  async run(input: unknown): Promise<DocumentResult> {
    const job = Schema.decodeUnknownSync(DocumentJob)(input);
    return this.env.CONTAINER.getByName("document-runtime").runDocument(job);
  }
}

export default {
  fetch: () => new Response("Not found", { status: 404 }),
} satisfies ExportedHandler<Env>;

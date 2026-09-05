import { WorkerEntrypoint } from "cloudflare:workers";
import { Container } from "@cloudflare/containers";
import { DocumentJob, DocumentResult } from "@river/contracts";
import { Schema } from "effect";

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
    if (!response.ok) throw new Error(`Document runtime failed with status ${response.status}`);
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

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CompileCache } from "./compile-cache.mjs";
import runtimeContract from "./runtime-contract.json" with { type: "json" };

const MAX_BODY = 15 * 1024 * 1024;
// Compiler resources and the complete bundled program/dependency lock identify this process's runtime.
const runtimeHash = createHash("sha256").update(process.version);
for (const path of ["/app/resources.json", "/app/process-job.mjs", "/workspace/pnpm-lock.yaml"])
  runtimeHash.update(
    createHash("sha256")
      .update(await readFile(path))
      .digest(),
  );
const cache = new CompileCache(runtimeHash.digest("hex"));
let busy = false;

createServer(
  { requestTimeout: 10_000, headersTimeout: 5_000, keepAliveTimeout: 5_000 },
  async (request, response) => {
    response.setHeader("X-River-Document-Protocol", runtimeContract.protocol);
    if (request.method === "GET" && request.url === "/healthz") {
      response.writeHead(200, { "Content-Type": "application/json" });
      return response.end(JSON.stringify({ status: "ok", protocol: runtimeContract.protocol }));
    }
    if (request.method !== "POST" || request.url !== "/jobs") {
      response.writeHead(404);
      return response.end();
    }
    if (busy) {
      response.writeHead(503, { "Retry-After": "2" });
      return response.end();
    }
    busy = true;
    let directory;
    let responseBody;
    let stagePath;
    let stage = "request-body";
    try {
      const chunks = [];
      let length = 0;
      for await (const chunk of request) {
        length += chunk.length;
        if (length > MAX_BODY) {
          response.writeHead(413);
          return;
        }
        chunks.push(chunk);
      }
      const body = Buffer.concat(chunks);
      let cacheKey = null;
      try {
        cacheKey = cache.key(JSON.parse(body.toString("utf8")));
      } catch {
        // Invalid input still takes the ordinary process validation and safe diagnostic path.
      }
      const cached = cacheKey ? cache.get(cacheKey) : null;
      response.setHeader("X-River-Document-Cache", cached ? "hit" : cacheKey ? "miss" : "bypass");
      if (cached) {
        response.writeHead(200, { "Content-Type": "application/json" });
        responseBody = cached;
        return;
      }
      directory = await mkdtemp(join(tmpdir(), "river-document-"));
      const input = join(directory, "input.json");
      const output = join(directory, "output.json");
      stagePath = join(directory, "stage.txt");
      await writeFile(input, body, { mode: 0o600 });
      stage = "document-process";
      await new Promise((resolve, reject) => {
        const child = spawn(
          process.execPath,
          ["--max-old-space-size=256", "/app/process-job.mjs", input, output, stagePath],
          {
            cwd: directory,
            stdio: ["ignore", "ignore", "ignore"],
            detached: true,
            env: {
              PATH: process.env.PATH,
              XDG_CACHE_HOME: "/opt/tectonic-cache",
              SOURCE_DATE_EPOCH: "0",
              TECTONIC_UNTRUSTED_MODE: "1",
            },
          },
        );
        const stopGroup = () => {
          if (!child.pid) return;
          try {
            process.kill(-child.pid, "SIGKILL");
          } catch (error) {
            if (error.code !== "ESRCH") throw error;
          }
        };
        const timer = setTimeout(() => {
          stage = "process-timeout";
          stopGroup();
        }, 90_000);
        child.once("error", (error) => {
          clearTimeout(timer);
          reject(error);
        });
        child.once("exit", (code) => {
          clearTimeout(timer);
          stopGroup();
          code === 0 ? resolve() : reject(new Error("Document job failed"));
        });
      });
      const result = await readFile(output);
      stage = "response-body";
      if (result.length > 30 * 1024 * 1024) throw new Error("Output limit exceeded");
      if (cacheKey) cache.put(cacheKey, result.toString("utf8"));
      response.writeHead(200, { "Content-Type": "application/json" });
      responseBody = result;
    } catch {
      if (stage === "document-process" && stagePath) {
        const recorded = await readFile(stagePath, "utf8").catch(() => null);
        if (recorded && Object.hasOwn(runtimeContract.stages, recorded)) stage = recorded;
      }
      console.error(JSON.stringify({ event: "document-job-failed", stage }));
      response.setHeader("X-River-Document-Stage", stage);
      response.writeHead(422, { "Content-Type": "application/json" });
      responseBody = JSON.stringify({ error: "Document processing failed." });
    } finally {
      if (directory) await rm(directory, { recursive: true, force: true });
      busy = false;
      // Finish cleanup before a caller can submit its next sequential job.
      response.end(responseBody);
    }
  },
).listen(8080, "0.0.0.0");

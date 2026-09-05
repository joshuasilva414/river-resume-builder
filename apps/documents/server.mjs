import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const MAX_BODY = 15 * 1024 * 1024;
let busy = false;

createServer(
  { requestTimeout: 10_000, headersTimeout: 5_000, keepAliveTimeout: 5_000 },
  async (request, response) => {
    if (request.method === "GET" && request.url === "/healthz") {
      response.writeHead(200, { "Content-Type": "application/json" });
      return response.end(JSON.stringify({ status: "ok" }));
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
    let stage = "request-body";
    try {
      const chunks = [];
      let length = 0;
      for await (const chunk of request) {
        length += chunk.length;
        if (length > MAX_BODY) {
          response.writeHead(413);
          response.end();
          return;
        }
        chunks.push(chunk);
      }
      directory = await mkdtemp(join(tmpdir(), "river-document-"));
      const input = join(directory, "input.json");
      const output = join(directory, "output.json");
      await writeFile(input, Buffer.concat(chunks), { mode: 0o600 });
      stage = "document-process";
      await new Promise((resolve, reject) => {
        const child = spawn(
          process.execPath,
          ["--max-old-space-size=256", "/app/process-job.mjs", input, output],
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
        const timer = setTimeout(stopGroup, 90_000);
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
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(result);
    } catch {
      console.error(JSON.stringify({ event: "document-job-failed", stage }));
      response.writeHead(422, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: "Document processing failed." }));
    } finally {
      if (directory) await rm(directory, { recursive: true, force: true });
      busy = false;
    }
  },
).listen(8080, "0.0.0.0");

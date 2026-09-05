import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, open, writeFile } from "node:fs/promises";
import https from "node:https";
import { dirname, join } from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import { fileURLToPath } from "node:url";

// This diagnostic never creates or uses real credentials and only targets personal staging.
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const origin = "https://river-staging.jilva.workers.dev";
const personalAccountId = "a91c30d69981b341efe3b656a263f6da";
const marker = `river-lifetime-${randomUUID()}`;
const directory = join(root, "test-results", "runtime", marker);
await mkdir(directory, { recursive: true, mode: 0o700 });
const logFile = await open(join(directory, "tail.jsonl"), "wx", 0o600);
const tail = spawn(
  "pnpm",
  [
    "exec",
    "wrangler",
    "tail",
    "river-staging",
    "--format=json",
    "--header",
    `X-River-Lifetime:${marker}`,
  ],
  {
    cwd: join(root, "apps/web"),
    env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: personalAccountId },
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  },
);
let log = "";
let writes = Promise.resolve();
for (const stream of [tail.stdout, tail.stderr])
  stream.on("data", (value) => {
    log += value.toString();
    writes = writes.then(() => logFile.write(value)).then(() => {});
  });
const stopped = new Promise((resolve, reject) => {
  tail.once("error", reject);
  tail.once("close", resolve);
});
function stopTail() {
  if (tail.exitCode !== null || !tail.pid) return;
  try {
    process.kill(-tail.pid, "SIGTERM");
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
  }
}
const deadline = setTimeout(stopTail, 60_000);
const client = new https.Agent({ keepAlive: true, maxSockets: 1 });
const nonexistentCredential = `Bearer river_${randomUUID()}.${"0".repeat(64)}`;

/** Wait for response completion, or deliberately disconnect after sending the complete request. */
function request(stage, abortMs = null) {
  return new Promise((resolve, reject) => {
    let timer;
    let cancelled = false;
    const start = performance.now();
    const req = https.request(
      `${origin}/api/v1/me?lifetime-proof=${marker}&stage=${stage}`,
      {
        agent: client,
        headers: { "X-River-Lifetime": marker, Authorization: nonexistentCredential },
      },
      (response) => {
        clearTimeout(timer);
        response.resume();
        response.on("error", reject);
        response.on("end", () =>
          resolve({
            stage,
            status: response.statusCode,
            ms: performance.now() - start,
            ray: response.headers["cf-ray"],
          }),
        );
      },
    );
    req.on("error", (error) => {
      clearTimeout(timer);
      if (cancelled) resolve({ stage, clientAborted: true, ms: performance.now() - start });
      else reject(error);
    });
    req.setTimeout(10_000, () => req.destroy(new Error("Probe deadline")));
    req.on("socket", (socket) => {
      function send() {
        req.end();
        if (abortMs !== null)
          timer = setTimeout(() => {
            cancelled = true;
            req.destroy(new Error("Intentional client disconnect"));
          }, abortMs);
      }
      if (socket.connecting) socket.once("secureConnect", send);
      else send();
    });
    req.flushHeaders();
  });
}

/** Wrangler emits indented JSON objects; only complete top-level event objects are considered. */
function serverEvents() {
  return [...log.matchAll(/\{\n[\s\S]*?^\}/gm)].flatMap(([raw]) => {
    const event = JSON.parse(raw);
    const url = event.event?.request?.url;
    if (!url?.includes(marker)) return [];
    return [
      {
        outcome: event.outcome,
        stage: new URL(url).searchParams.get("stage"),
        status: event.event?.response?.status,
        exceptionNames: event.exceptions?.map((exception) => exception.name) ?? [],
      },
    ];
  });
}

const requests = [];
let status = "inconclusive";
let stage = "waiting-for-tail";
const reportPath = join(directory, "report.json");
try {
  let ready = false;
  // CLI startup includes authentication and log-session registration; an empty file is not ready.
  for (let index = 0; index < 12 && tail.exitCode === null; index++) {
    const result = await request(`control-${index}`);
    assert.equal(result.status, 401);
    requests.push(result);
    await pause(2_000);
    if (serverEvents().length) {
      ready = true;
      break;
    }
  }
  assert.ok(ready, "Filtered tail did not observe its control; no blind probes were sent.");
  stage = "probing";
  for (const milliseconds of [25, 50, 100]) {
    requests.push(await request(`abort-${milliseconds}`, milliseconds));
    await pause(1_000);
  }
  const subsequent = await request("after-aborts");
  requests.push(subsequent);
  assert.equal(subsequent.status, 401);
  await pause(5_000);
  const events = serverEvents();
  const confirmed = events.some(
    (event) => event.stage?.startsWith("abort-") && event.outcome === "canceled",
  );
  stage = "completed";
  status = confirmed ? "passed" : "inconclusive";
  assert.ok(confirmed, "Client disconnect alone does not prove a canceled Worker invocation.");
} finally {
  clearTimeout(deadline);
  client.destroy();
  stopTail();
  await stopped;
  await writes;
  await logFile.close();
  const report = { status, stage, origin, marker, requests, events: serverEvents() };
  await writeFile(reportPath, JSON.stringify(report, null, 2), { mode: 0o600, flag: "wx" });
  console.log(JSON.stringify({ status, stage, report: reportPath }, null, 2));
}

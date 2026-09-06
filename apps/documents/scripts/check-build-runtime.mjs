import { spawn } from "node:child_process";
import { once } from "node:events";

process.env.RIVER_FIXTURE_PATH = "/tmp/fixture.json";
process.env.RIVER_FIXTURE_OUTPUT = "file:///tmp/fixture-results/";
process.env.RIVER_TEST_DIRECT = "1";
const fixture = spawn(
  process.execPath,
  ["/workspace/apps/documents/dist/fixture.mjs", process.env.RIVER_FIXTURE_PATH],
  { stdio: "inherit" },
);
const [fixtureCode] = await once(fixture, "exit");
if (fixtureCode !== 0) throw new Error(`Fixture generation failed (${fixtureCode}).`);

const server = spawn(process.execPath, ["/app/server.mjs"], { stdio: "inherit" });
try {
  const deadline = Date.now() + 10_000;
  for (;;) {
    try {
      const response = await fetch("http://127.0.0.1:8080/healthz", {
        signal: AbortSignal.timeout(1_000),
      });
      if (response.ok) break;
    } catch {}
    if (Date.now() >= deadline) throw new Error("Document service did not become ready.");
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  await import("./check-runtime.mjs");
} finally {
  server.kill();
  await once(server, "exit");
}

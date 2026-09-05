import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../..", import.meta.url));
const docker =
  process.env.DOCKER_PATH ??
  (existsSync("/Applications/Docker.app/Contents/Resources/bin/docker")
    ? "/Applications/Docker.app/Contents/Resources/bin/docker"
    : "docker");
const container = `river-fixtures-${Date.now()}`;
async function run(command, args, env = process.env) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, env, stdio: "inherit" });
    child.once("error", reject);
    child.once("close", (code) =>
      code === 0 ? resolve() : reject(Error(`${command} failed (${code})`)),
    );
  });
}
await run("pnpm", ["--filter", "@river/documents", "exec", "node", "build.mjs"]);
const fixture = fileURLToPath(new URL("../dist/fixture.json", import.meta.url));
await run(process.execPath, ["apps/documents/dist/fixture.mjs", fixture]);
await run(docker, [
  "build",
  "--platform",
  "linux/amd64",
  "-f",
  "Dockerfile.documents",
  "-t",
  "river-documents:fixtures",
  ".",
]);
try {
  await run(docker, [
    "run",
    "--detach",
    "--platform",
    "linux/amd64",
    "--name",
    container,
    "--network",
    "none",
    "--memory",
    "512m",
    "--cpus",
    "1",
    "river-documents:fixtures",
  ]);
  await run(process.execPath, ["apps/documents/scripts/check-runtime.mjs"], {
    ...process.env,
    DOCKER_PATH: docker,
    RIVER_TEST_CONTAINER: container,
    RIVER_FIXTURE_PATH: fixture,
  });
  await run(docker, [
    "exec",
    container,
    "node",
    "-e",
    'const fs=require("fs");console.log("Peak memory bytes:",fs.readFileSync("/sys/fs/cgroup/memory.peak","utf8").trim())',
  ]);
} finally {
  await run(docker, ["rm", "--force", container]);
}

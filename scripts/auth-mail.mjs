import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const email = process.argv
  .slice(2)
  .filter((argument) => argument !== "--")[0]
  ?.trim()
  .toLowerCase();
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error("Usage: pnpm auth:mail -- you@example.test");
  process.exit(1);
}
const root = fileURLToPath(new URL("../", import.meta.url));
const config = JSON.parse(
  await readFile(new URL("../apps/web/wrangler.jsonc", import.meta.url), "utf8"),
);
const bucket = config.r2_buckets.find((binding) => binding.binding === "ARTIFACTS")?.bucket_name;
if (!bucket) throw new Error("The local ARTIFACTS bucket is not configured.");
const directory = await mkdtemp(join(tmpdir(), "river-auth-mail-"));
try {
  const filename = join(directory, "message.json");
  const digest = createHash("sha256").update(email).digest("hex");
  const result = spawnSync(
    "pnpm",
    [
      "--filter",
      "@river/web",
      "exec",
      "wrangler",
      "r2",
      "object",
      "get",
      `${bucket}/development/auth/${digest}/latest.json`,
      "--local",
      "--file",
      filename,
    ],
    { cwd: root, encoding: "utf8" },
  );
  if (result.status !== 0) {
    console.error(
      "No local message could be read. Create the account or request another verification/reset message first.",
    );
    process.exitCode = 1;
  } else {
    const message = JSON.parse(await readFile(filename, "utf8"));
    console.log(`${message.subject}\n\n${message.text}`);
  }
} finally {
  await rm(directory, { recursive: true, force: true });
}

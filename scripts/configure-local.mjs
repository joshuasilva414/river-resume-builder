import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";

const path = new URL("../apps/web/.dev.vars", import.meta.url);
try {
  await writeFile(
    path,
    `AUTH_SECRET=${randomBytes(48).toString("base64url")}\nAI_CREDENTIAL_ENCRYPTION_KEY=${randomBytes(32).toString("hex")}\n`,
    {
      flag: "wx",
      mode: 0o600,
    },
  );
  console.log("Created apps/web/.dev.vars with a local authentication secret.");
} catch (error) {
  if (error.code !== "EEXIST") throw error;
  console.log("Kept the existing apps/web/.dev.vars.");
}

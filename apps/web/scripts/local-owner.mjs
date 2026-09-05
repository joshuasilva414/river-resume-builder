import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";

const baseURL = "http://127.0.0.1:3000";
const password = randomBytes(24).toString("base64url");
const response = await fetch(`${baseURL}/api/auth/sign-up/email`, {
  method: "POST",
  headers: { "content-type": "application/json", origin: baseURL },
  body: JSON.stringify({
    email: "joshuasilva414@gmail.com",
    password,
    name: "Joshua",
    callbackURL: "/",
  }),
});
if (!response.ok) throw Error(`Local signup failed (${response.status}): ${await response.text()}`);
await writeFile(
  ".dev-owner.json",
  JSON.stringify({ email: "joshuasilva414@gmail.com", password }),
  { mode: 0o600, flag: "wx" },
);
console.log("Local owner created. Read development/auth/latest.json from local R2 to verify.");

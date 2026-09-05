import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { privateFile, query, root } from "./lib/recovery.mjs";

const args = process.argv.slice(2);
const environment = args[0] === "--production" ? "production" : "staging";
if (args[0] === "--production" || args[0] === "--staging") args.shift();
const [date] = args;
assert.ok(
  args.length <= 1,
  "Use pnpm backup:status [--production], or pnpm backup:status [--production] YYYY-MM-DD to save a completed run's restore receipt.",
);
if (date) assert.match(date, /^\d{4}-\d{2}-\d{2}$/);
const rows = await query(
  `SELECT b.date, b.operation_id, o.state, o.stage, o.failure, b.manifest, b.completed_at FROM database_backups b JOIN operations o ON o.id=b.operation_id ${date ? `WHERE b.date='${date}'` : ""} ORDER BY b.date DESC LIMIT 7`,
  environment,
);
if (!date) {
  console.log(
    JSON.stringify(
      {
        environment: `personal ${environment}`,
        backups: rows.map((row) => ({
          ...row,
          manifest: row.manifest ? JSON.parse(row.manifest) : null,
        })),
      },
      null,
      2,
    ),
  );
} else {
  const backup = rows[0];
  assert.ok(
    backup?.state === "Succeeded" && backup.manifest,
    "This daily backup has no confirmed retained manifest. Inspect status and use the manual backup procedure.",
  );
  const directory = join(root, "test-results", "recovery", `receipt-${date}-${randomUUID()}`);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const receipt = await privateFile(
    join(directory, "receipt.json"),
    JSON.stringify(
      {
        ...JSON.parse(backup.manifest),
        operationId: backup.operation_id,
        createdAt: new Date(backup.completed_at).toISOString(),
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ status: "receipt-saved", receipt }, null, 2));
}

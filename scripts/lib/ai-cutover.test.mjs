import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { root } from "./recovery.mjs";

test("cutover pauses new AI work while accepted tasks drain and manual work continues", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("PRAGMA foreign_keys=ON");
    const migrationDirectory = join(root, "packages/db/migrations");
    for (const name of (await readdir(migrationDirectory))
      .filter((name) => name.endsWith(".sql"))
      .sort())
      db.exec(await readFile(join(migrationDirectory, name), "utf8"));
    db.prepare(
      "INSERT INTO user (id,name,email,email_verified,created_at,updated_at) VALUES (?,?,?,?,?,?)",
    ).run("owner", "Fixture", "cutover@example.test", 1, Date.now(), Date.now());
    const insert = db.prepare(
      "INSERT INTO operations (id,owner_id,input,state,stage,created_at,updated_at) VALUES (?,'owner',?,?, 'Fixture',?,?)",
    );
    const add = (id, input, state = "Succeeded") =>
      insert.run(id, JSON.stringify(input), state, Date.now(), Date.now());
    add("accepted", { type: "source-ai", taskId: "existing-task" }, "Pending");

    const pause = await readFile(join(root, "scripts/sql/v1.1-pause-ai.sql"), "utf8");
    db.exec(pause);
    db.exec(pause);
    for (const type of [
      "job-ai",
      "wording-ai",
      "source-ai",
      "duplicate-ai",
      "template-ai",
      "source-refinement",
    ]) {
      assert.throws(
        () => add(type, { type, taskId: "new-task" }, "Pending"),
        /river_v11_ai_admission_paused/,
      );
    }
    // Retrying a failed task inserts another operation and is paused by the same gate.
    assert.throws(
      () => add("retry", { type: "source-ai", taskId: "existing-task" }, "Pending"),
      /river_v11_ai_admission_paused/,
    );
    db.prepare("UPDATE operations SET state='Succeeded' WHERE id=?").run("accepted");
    assert.equal(
      db.prepare("SELECT state FROM operations WHERE id='accepted'").get().state,
      "Succeeded",
    );
    add("extraction", { sourceId: "source", processingId: "processing" });
    add("pdf", { document: {}, theme: "classic" });
    add("template-check", { type: "template-validation", validationId: "validation" });
    add("backup", { type: "database-backup", date: "fixture" });
    add("accepted-refinement", { type: "source-refinement-accept", taskId: "reviewed-task" });
    add("scoring", { type: "checkpoint-score", runId: "score" });

    const resume = await readFile(join(root, "scripts/sql/v1.1-resume-ai.sql"), "utf8");
    db.exec(resume);
    db.exec(resume);
    add("new-byok-task", { type: "source-ai", taskId: "personal-connection-task" }, "Pending");
    assert.equal(db.prepare("SELECT count(*) AS total FROM operations").get().total, 8);
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    db.close();
  }
});

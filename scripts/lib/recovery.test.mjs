import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import {
  catalogQuery,
  resourcesFor,
  restoreDatabase,
  retainedObjects,
  root,
  sha256,
} from "./recovery.mjs";

test("restores accepted task history at capacity, then enforces admission on new tasks", async () => {
  const directory = await mkdtemp(join(tmpdir(), "river-recovery-test-"));
  try {
    const migrations = await migrationBundle();
    const empty = new DatabaseSync(":memory:");
    for (const migration of migrations) empty.exec(migration.sql);
    const tables = empty
      .prepare(catalogQuery)
      .all()
      .map((row) => row.name);
    empty.close();
    const timestamp = Date.now() - 86_400_000;
    const task = (id, state) =>
      `INSERT INTO operations (id,owner_id,input,state,stage,created_at,updated_at)
       VALUES ('${id}','fixture-owner','{"type":"extract-source"}','${state}','Fixture',${timestamp},${timestamp});`;
    const data = `INSERT INTO user (id,name,email,email_verified,created_at,updated_at)
      VALUES ('fixture-owner','Fixture','fixture@example.test',1,${timestamp},${timestamp});
      INSERT INTO scoring_policy(id,daily_limit,revision) VALUES ('default',25,0);
      ${Array.from({ length: 4 }, (_, index) => task(`active-${index}`, "Pending")).join("\n")}
      ${task("completed-history", "Succeeded")}`;
    const snapshot = {
      format: "river-d1-snapshot-v1",
      resources: resourcesFor("staging"),
      migrations,
      tables,
      data,
      dataSha256: sha256(data),
    };
    const { db } = await restoreDatabase(snapshot, join(directory, "restored.sqlite"), "staging");
    try {
      assert.equal(db.prepare("SELECT count(*) AS total FROM operations").get().total, 5);
      assert.equal(
        db.prepare("SELECT state FROM operations WHERE id='completed-history'").get().state,
        "Succeeded",
      );
      assert.throws(() => db.exec(task("new-work", "Pending")), /river_usage_owner_active/);
    } finally {
      db.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

async function migrationBundle(max = "9999") {
  const names = (await readdir(join(root, "packages/db/migrations")))
    .filter((name) => name.endsWith(".sql") && name.slice(0, 4) <= max)
    .sort();
  for (const name of names) assert.match(name, /^\d{4}_[a-z0-9_]+\.sql$/);
  return Promise.all(
    names.map(async (name) => {
      const sql = await readFile(join(root, "packages/db/migrations", name), "utf8");
      return { name, sql, sha256: sha256(sql) };
    }),
  );
}
function fixtureDatabase(migrations) {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  for (const migration of migrations) db.exec(migration.sql);
  return db;
}
function insert(db, table, values) {
  const keys = Object.keys(values);
  db.prepare(
    `INSERT INTO "${table}" (${keys.map((key) => `"${key}"`).join(",")}) VALUES (${keys.map(() => "?").join(",")})`,
  ).run(...Object.values(values));
}
function snapshotOf(db, migrations) {
  const tables = db
    .prepare(catalogQuery)
    .all()
    .map((row) => row.name);
  const records = Object.fromEntries(
    tables.map((table) => [table, db.prepare(`SELECT * FROM "${table}"`).all()]),
  );
  // The same complete data-only table replay used by D1 exports, including migration seed rows.
  const data = tables
    .flatMap((table) =>
      records[table].map(
        (row) =>
          `INSERT INTO "${table}" (${Object.keys(row)
            .map((key) => `"${key}"`)
            .join(",")}) VALUES (${Object.values(row)
            .map((value) => db.prepare("SELECT quote(?) AS value").get(value).value)
            .join(",")});`,
      ),
    )
    .join("\n");
  return {
    records,
    snapshot: {
      format: "river-d1-snapshot-v1",
      resources: resourcesFor("staging"),
      tables,
      migrations,
      data,
      dataSha256: sha256(data),
      counts: Object.fromEntries(tables.map((table) => [table, records[table].length])),
    },
  };
}
function userFixture(db) {
  const now = Date.now();
  insert(db, "user", {
    id: "owner",
    name: "Recovery fixture",
    email: "recovery@example.test",
    email_verified: 1,
    created_at: now,
    updated_at: now,
  });
  return now;
}
function operation(db, id, state, type = "template-score") {
  insert(db, "operations", {
    id,
    owner_id: "owner",
    input: JSON.stringify({ type, runId: "score-run" }),
    state,
    stage: "Recovery fixture",
    created_at: Date.now(),
    updated_at: Date.now(),
  });
}
function scoringFixtures(db, now) {
  operation(db, "score-operation", "Pending");
  insert(db, "template_scoring_runs", {
    id: "score-run",
    owner_id: "owner",
    base: '{"kind":"fixed","theme":"classic"}',
    graph: "{}",
    graph_digest: "graph-digest",
    fixture_set: "{}",
    profile: "{}",
    operation_id: "score-operation",
    created_at: now,
  });
  insert(db, "template_scoring_fixtures", {
    run_id: "score-run",
    fixture_id: "retained",
    raw_response_json: '{"results":[]}',
    result_digest: "retained-result-digest",
    result_operation_id: "score-operation",
    received_at: now,
  });
  insert(db, "template_scoring_fixtures", { run_id: "score-run", fixture_id: "pending" });
}

test("round-trips all v1.2 data and preserves quota resets, reservation states, and retained trash objects", async () => {
  const directory = await mkdtemp(join(tmpdir(), "river-v12-recovery-")),
    migrations = await migrationBundle(),
    source = fixtureDatabase(migrations);
  let restored;
  try {
    const now = userFixture(source),
      day = new Date(now).toISOString().slice(0, 10);
    scoringFixtures(source, now);
    operation(source, "source-operation", "Succeeded", "extract-source");
    insert(source, "sources", {
      id: "source",
      owner_id: "owner",
      title: "Trashed source",
      filename: "resume.txt",
      mime: "text/plain",
      kind: "pasted",
      note: "Private note",
      digest: sha256("original"),
      byte_length: 8,
      object_key: "retained/source/original",
      state: "Ready",
      operation_id: "source-operation",
      current_processing_id: "processing",
      created_at: now,
      updated_at: now,
      archived_at: now,
      extraction_ai: '{"connectionId":"connection","modelId":"saved-model"}',
    });
    insert(source, "source_processing_results", {
      id: "processing",
      source_id: "source",
      operation_id: "source-operation",
      object_key: "retained/source/extraction",
      digest: sha256("extraction"),
      parser: "plain-text",
      parser_version: "1",
      character_count: 8,
      created_at: now,
    });
    insert(source, "evidence_claims", {
      id: "claim",
      owner_id: "owner",
      revision: 1,
      current_revision_id: "claim-revision",
      assertion: "Saved experience",
      metadata: '{"type":"Credential","tags":["education"]}',
      review_state: "Draft",
      archived_at: now,
      search_text: "Saved experience",
      created_at: now,
      updated_at: now,
    });
    insert(source, "evidence_revisions", {
      id: "claim-revision",
      claim_id: "claim",
      material:
        '{"assertion":"Saved experience","sourceIds":["source"],"citations":[],"contexts":[]}',
      actor_id: "owner",
      created_at: now,
    });
    const structured = JSON.stringify({
      structured: {
        schema: {
          kind: "inline",
          definition: {
            id: "experience",
            fields: [
              { id: "role", kind: "text" },
              { id: "end", kind: "date" },
            ],
          },
        },
        values: { role: "Engineer", end: { kind: "present" } },
        evidence: [{ claimId: "claim", revisionId: "claim-revision" }],
      },
    });
    insert(source, "library_items", {
      id: "entry",
      owner_id: "owner",
      kind: "block",
      type: "experience",
      label: "Saved entry",
      current_revision_id: "entry-revision",
      created_at: now,
      updated_at: now,
      archived_at: now,
    });
    insert(source, "library_revisions", {
      id: "entry-revision",
      item_id: "entry",
      data: structured,
      label: "Saved entry",
      rationale: "",
      actor_id: "owner",
      created_at: now,
    });
    insert(source, "template_designs", {
      id: "design",
      owner_id: "owner",
      name: "Saved schema layout",
      scope: '{"level":"block","type":"experience"}',
      current_revision_id: "design-revision",
      created_at: now,
      updated_at: now,
      archived_at: now,
    });
    insert(source, "template_revisions", {
      id: "design-revision",
      design_id: "design",
      version: 1,
      graph: structured,
      digest: sha256(structured),
      origins: "[]",
      state: "Approved",
      created_at: now,
      actor_id: "owner",
    });
    insert(source, "template_validations", {
      id: "validation",
      revision_id: "design-revision",
      operation_id: "source-operation",
      graph_digest: sha256(structured),
      fixture_set_digest: "fixture-digest",
      renderer: "renderer",
      validator: "validator",
      created_at: now,
      approve_on_success: 1,
    });
    insert(source, "job_imports", {
      id: "import",
      owner_id: "owner",
      input: '{"url":"https://example.test/job"}',
      profile: '{"model":"selected"}',
      text: "Full imported posting",
      retrieved_url: "https://example.test/job",
      retrieval_method: "html",
      analysis: '{"qualifications":["A"],"eligibility":["B"]}',
      latest_operation_id: "source-operation",
      created_at: now,
    });
    insert(source, "ai_connections", {
      id: "connection",
      owner_id: "owner",
      provider: "openai",
      encrypted_key: '{"ciphertext":"opaque-recovery-fixture","iv":"fixture"}',
      key_suffix: "test",
      created_at: now,
      updated_at: now,
    });
    source.exec("UPDATE scoring_policy SET daily_limit=99,revision=7 WHERE id='default'");
    insert(source, "scoring_account_policy", { owner_id: "owner", daily_limit: 2, revision: 3 });
    // An administrator reset can leave Consumed history with today's count at zero. Do not reconstruct it.
    insert(source, "scoring_usage_days", { owner_id: "owner", day, used: 0 });
    insert(source, "scoring_usage_days", { owner_id: "owner", day: "2000-01-01", used: 23 });
    for (const [id, state] of [
      ["retained", "Consumed"],
      ["pending", "Reserved"],
      ["failed", "Released"],
    ])
      insert(source, "scoring_usage_reservations", {
        id: `template:score-run:${id}`,
        owner_id: "owner",
        operation_id: "score-operation",
        state,
        created_at: now,
      });
    const { snapshot, records } = snapshotOf(source, migrations);
    restored = (await restoreDatabase(snapshot, join(directory, "restored.sqlite"), "staging")).db;
    for (const table of snapshot.tables)
      assert.deepEqual(
        restored.prepare(`SELECT * FROM "${table}"`).all(),
        records[table],
        `Exact base rows: ${table}`,
      );
    assert.deepEqual(retainedObjects(restored), retainedObjects(source));
    assert.equal(
      retainedObjects(restored).length,
      2,
      "Trashed source original and extraction remain required",
    );
    restored.exec(
      "UPDATE scoring_usage_reservations SET state='Consumed' WHERE id='template:score-run:retained'",
    );
    assert.equal(
      restored.prepare("SELECT used FROM scoring_usage_days WHERE day=?").get(day).used,
      0,
    );
    restored.exec(
      "UPDATE scoring_usage_reservations SET state='Consumed' WHERE id='template:score-run:pending'",
    );
    restored.exec(
      "UPDATE scoring_usage_reservations SET state='Consumed' WHERE id='template:score-run:pending'",
    );
    assert.equal(
      restored.prepare("SELECT used FROM scoring_usage_days WHERE day=?").get(day).used,
      1,
    );
    insert(restored, "scoring_usage_reservations", {
      id: "new-pending",
      owner_id: "owner",
      operation_id: "score-operation",
      state: "Reserved",
      created_at: now,
    });
    restored.exec("UPDATE operations SET state='Cancelled' WHERE id='score-operation'");
    assert.equal(
      restored.prepare("SELECT state FROM scoring_usage_reservations WHERE id='new-pending'").get()
        .state,
      "Released",
    );
    assert.equal(
      restored.prepare("SELECT used FROM scoring_usage_days WHERE day=?").get(day).used,
      1,
    );
    assert.equal(restored.prepare("SELECT daily_limit FROM scoring_policy").get().daily_limit, 99);
  } finally {
    restored?.close();
    source.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("restores a pre-v1.2 snapshot before additive migration without rewriting retained scoring history", async () => {
  const directory = await mkdtemp(join(tmpdir(), "river-old-recovery-")),
    old = await migrationBundle("0033"),
    source = fixtureDatabase(old);
  let restored;
  try {
    const now = userFixture(source);
    scoringFixtures(source, now);
    const { snapshot } = snapshotOf(source, old);
    restored = (await restoreDatabase(snapshot, join(directory, "old.sqlite"), "staging")).db;
    const before = restored
      .prepare("SELECT * FROM template_scoring_fixtures ORDER BY fixture_id")
      .all();
    for (const migration of (await migrationBundle()).filter(
      (migration) => migration.name.slice(0, 4) > "0033",
    ))
      restored.exec(migration.sql);
    assert.deepEqual(
      restored.prepare("SELECT * FROM template_scoring_fixtures ORDER BY fixture_id").all(),
      before,
    );
    assert.equal(restored.prepare("SELECT used FROM scoring_usage_days").get().used, 1);
    assert.equal(restored.prepare("SELECT daily_limit FROM scoring_policy").get().daily_limit, 25);
    assert.deepEqual(
      restored
        .prepare("SELECT id,state FROM scoring_usage_reservations")
        .all()
        .map((row) => ({ ...row })),
      [{ id: "template:score-run:pending", state: "Reserved" }],
    );
    const roundtrip = snapshotOf(restored, await migrationBundle());
    const again = await restoreDatabase(
      roundtrip.snapshot,
      join(directory, "upgraded.sqlite"),
      "staging",
    );
    assert.deepEqual(again.counts, roundtrip.snapshot.counts);
    again.db.close();
  } finally {
    restored?.close();
    source.close();
    await rm(directory, { recursive: true, force: true });
  }
});

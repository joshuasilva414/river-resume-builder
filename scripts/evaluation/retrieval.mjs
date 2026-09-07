import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { claims, queries } from "./retrieval-fixture.mjs";

// Optional semantic file contains rankings from Workers AI embeddings, never credentials.
const semantic = process.argv[2] ? JSON.parse(await readFile(process.argv[2], "utf8")) : null;
const database = new DatabaseSync(":memory:");
database.exec("CREATE VIRTUAL TABLE evidence_search USING fts5(id UNINDEXED, text)");
const eligible = new Map(
  claims
    .filter(
      (claim) =>
        claim.owner === "owner-a" && !claim.archived && claim.revision === claim.indexedRevision,
    )
    .map((claim) => [claim.id, claim]),
);
for (const claim of eligible.values())
  database.prepare("INSERT INTO evidence_search VALUES (?, ?)").run(claim.id, claim.text);
const measure = (ids) => ids.filter((id) => eligible.has(id)).slice(0, 30);
function fuse(lexical, vector) {
  if (!vector?.length) return measure(lexical);
  const scores = new Map();
  for (const list of [measure(lexical), measure(vector)])
    list.forEach((id, index) => {
      scores.set(id, (scores.get(id) ?? 0) + 1 / (60 + index + 1));
    });
  return measure(
    [...scores].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([id]) => id),
  );
}
const metrics = (ids, relevant) => ({
  recallAt30: relevant.filter((id) => ids.includes(id)).length / relevant.length,
  reciprocalRank: ids.some((id) => relevant.includes(id))
    ? 1 / (ids.findIndex((id) => relevant.includes(id)) + 1)
    : 0,
  topFive: ids.slice(0, 5),
});
const results = queries.map((query) => {
  const match = query.keywords.map((term) => `"${term}"*`).join(" OR ");
  const started = performance.now();
  const lexical = database
    .prepare(
      "SELECT id FROM evidence_search WHERE evidence_search MATCH ? ORDER BY bm25(evidence_search), id",
    )
    .all(match)
    .map((row) => row.id);
  const lexicalMs = performance.now() - started;
  const newest = [...lexical].sort(
    (a, b) => eligible.get(b).updated - eligible.get(a).updated || b.localeCompare(a),
  );
  const vector = measure(
    semantic?.queries.find((result) => result.id === query.id)?.ranking.map((row) => row.id) ?? [],
  );
  const hybrid = fuse(lexical, vector);
  for (const list of [measure(newest), measure(lexical), hybrid]) {
    assert(list.length <= 30);
    assert(list.every((id) => eligible.has(id)));
  }
  // No embeddings or an unavailable semantic service deterministically falls back to lexical order.
  assert.deepEqual(fuse(lexical, undefined), measure(lexical));
  assert.deepEqual(fuse(lexical, ["foreign", "archived", "stale"]), measure(lexical));
  return {
    id: query.id,
    lexicalMs,
    newest: metrics(measure(newest), query.relevant),
    lexical: metrics(measure(lexical), query.relevant),
    hybrid: semantic ? metrics(hybrid, query.relevant) : null,
  };
});
const report = {
  date: new Date().toISOString(),
  fictional: true,
  claimCount: claims.length,
  eligibleCount: eligible.size,
  candidateCap: 30,
  model: semantic?.model ?? null,
  embeddingElapsedMs: semantic?.elapsedMs ?? null,
  embeddingInputCharacters: semantic?.inputCharacters ?? null,
  results,
  limits: [
    "Local SQLite FTS5 and exact cosine, not a hosted D1/Vectorize latency measurement.",
    "Synthetic graded relevance; no real candidate or ranking-model evaluation.",
    "Owner, archival and revision filters exercised locally; hosted isolation and indexing remain untested.",
  ],
};
await writeFile(
  new URL("../../docs/evaluation/v1.1-retrieval.json", import.meta.url),
  `${JSON.stringify(report, null, 2)}\n`,
);
console.log(JSON.stringify(report, null, 2));

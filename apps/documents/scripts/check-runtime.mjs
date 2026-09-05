import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const docker = process.env.DOCKER_PATH ?? "/Applications/Docker.app/Contents/Resources/bin/docker";
const container = process.env.RIVER_TEST_CONTAINER ?? "river-phase0-runtime";
const fixture = JSON.parse(
  await readFile(
    process.env.RIVER_FIXTURE_PATH ?? new URL("../dist/fixture.json", import.meta.url),
    "utf8",
  ),
);
const output = new URL("../test-results/", import.meta.url);
await mkdir(output, { recursive: true });
async function run(job) {
  const start = performance.now();
  const result = await new Promise((resolve, reject) => {
    const code =
      'let chunks=[]; for await (const c of process.stdin) chunks.push(c); const r=await fetch("http://127.0.0.1:8080/jobs", {method:"POST",body:Buffer.concat(chunks),headers:{"content-type":"application/json"}}); console.log(JSON.stringify({status:r.status,body:await r.json()}));';
    const child = spawn(
      docker,
      ["exec", "-i", container, "node", "--input-type=module", "-e", code],
      { stdio: ["pipe", "pipe", "inherit"] },
    );
    let text = "";
    child.stdout.on("data", (chunk) => {
      text += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve(JSON.parse(text)) : reject(Error(`Docker exec failed: ${code}`)),
    );
    child.stdin.end(JSON.stringify(job));
  });
  return { ...result, elapsedMs: performance.now() - start };
}
const measurements = [];
let classicFingerprint;
for (const theme of ["classic", "classic", "minimal", "technical"]) {
  const result = await run({ ...fixture, theme });
  measurements.push({
    theme,
    status: result.status,
    elapsedMs: result.elapsedMs,
    durationMs: result.body.durationMs,
    passed: result.body.validation?.passed,
  });
  if (result.status !== 200) {
    console.error(JSON.stringify(measurements, null, 2));
    process.exitCode = 1;
    break;
  }
  await writeFile(new URL(`${theme}.pdf`, output), Buffer.from(result.body.pdfBase64, "base64"));
  await writeFile(new URL(`${theme}.json`, output), JSON.stringify(result.body, null, 2));
  assert.equal(
    result.body.validation.passed,
    true,
    `${theme}: ${JSON.stringify(result.body.validation)}`,
  );
  assert.match(result.body.resources.cacheDigest, /^[a-f0-9]{64}$/);
  if (theme === "classic") {
    if (classicFingerprint)
      assert.equal(
        result.body.fingerprint,
        classicFingerprint,
        "Identical inputs and resources must produce identical artifact identities",
      );
    classicFingerprint = result.body.fingerprint;
  }
  const extraction = await run({
    type: "extract-source",
    jobId: "pdf-citations",
    mime: "application/pdf",
    contentBase64: result.body.pdfBase64,
  });
  assert.equal(extraction.status, 200);
  for (const segment of extraction.body.segments)
    assert.equal(extraction.body.text.slice(segment.start, segment.end), segment.text);
}
for (const theme of ["classic", "minimal", "technical"]) {
  const result = await run({ ...fixture, theme, document: fixture.allTypesDocument });
  assert.equal(result.status, 200, `${theme} all seven types`);
  assert.equal(result.body.validation.passed, true, JSON.stringify(result.body.validation));
  await writeFile(
    new URL(`${theme}-all-types.pdf`, output),
    Buffer.from(result.body.pdfBase64, "base64"),
  );
  await writeFile(new URL(`${theme}-all-types.json`, output), JSON.stringify(result.body, null, 2));
}
for (const item of fixture.templateFixtures) {
  const job = {
    type: "validate-template",
    jobId: `custom-${item.id}`,
    theme: "classic",
    templateGraph: fixture.customGraph,
    document: item.document,
  };
  const first = await run(job),
    second = await run(job);
  assert.equal(first.status, 200, `custom ${item.id}`);
  assert.equal(second.status, 200, `custom repeat ${item.id}`);
  assert.equal(first.body.validation.passed, true, JSON.stringify(first.body.validation));
  assert.equal(second.body.validation.passed, true, JSON.stringify(second.body.validation));
  assert.equal(first.body.fingerprint, second.body.fingerprint, `custom deterministic ${item.id}`);
  assert.equal(first.body.rendererVersion, "river-tectonic-0.3.0");
  await writeFile(
    new URL(`custom-${item.id}.pdf`, output),
    Buffer.from(first.body.pdfBase64, "base64"),
  );
  await writeFile(new URL(`custom-${item.id}.json`, output), JSON.stringify(first.body, null, 2));
}
console.log(
  "Custom graph: four canonical fixtures, inherited styles, cross-pack bindings, and repeat rendering passed.",
);
// Each supported article size needs its own offline class resources (size11/size12.clo).
for (const bodySize of [9, 10, 11, 12]) {
  const graph = fixture.customGraph;
  const templateGraph = {
    ...graph,
    document: {
      ...graph.document,
      manifest: {
        ...graph.document.manifest,
        overrides: { ...graph.document.manifest.overrides, bodySize },
      },
    },
  };
  const result = await run({
    type: "validate-template",
    jobId: `article-${bodySize}`,
    theme: "classic",
    templateGraph,
    document: fixture.allTypesDocument,
  });
  assert.equal(result.status, 200, `offline article size ${bodySize}`);
  assert.equal(result.body.validation.passed, true, `article size ${bodySize} text integrity`);
}
console.log("All supported document body sizes rendered offline with text integrity passing.");
const normalize = (text) => text.replace(/\s+/g, " ").trim();
const expectedSource = await readFile(
  new URL("../fixtures/representative.txt", import.meta.url),
  "utf8",
);
for (const [file, mime] of [
  [
    "representative.docx",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
  ["representative.txt", "text/plain"],
]) {
  const bytes = await readFile(new URL(`../fixtures/${file}`, import.meta.url));
  const result = await run({
    type: "extract-source",
    jobId: file,
    mime,
    contentBase64: bytes.toString("base64"),
  });
  assert.equal(result.status, 200, file);
  assert.equal(normalize(result.body.text), normalize(expectedSource), file);
  for (const segment of result.body.segments)
    assert.equal(result.body.text.slice(segment.start, segment.end), segment.text);
}
const specials =
  "Café, José, naïve — 25% & C#; $500, snake_case, {value}, ~home, x^2, \\input{private}.";
for (const [name, paragraphs, expectedPass] of [
  ["unicode-and-escaping", [specials], true],
  [
    "multiple-pages",
    Array.from(
      { length: 80 },
      (_, i) => `Entry ${i + 1}. Repeated evidence is preserved in the required reading order.`,
    ),
    true,
  ],
  ["unsupported-glyph", ["中文"], false],
]) {
  const result = await run({
    ...fixture,
    document: {
      name: "Fixture",
      contact: [],
      sections: [{ heading: name, blocks: [{ heading: "", detail: "", paragraphs, bullets: [] }] }],
    },
  });
  assert.equal(result.status, 200, name);
  assert.equal(
    result.body.validation.passed,
    expectedPass,
    `${name}: ${JSON.stringify(result.body.validation)}`,
  );
  if (name === "multiple-pages") {
    const extraction = await run({
      type: "extract-source",
      jobId: name,
      mime: "application/pdf",
      contentBase64: result.body.pdfBase64,
    });
    assert.equal(extraction.status, 200);
    assert.ok(extraction.body.segments.length > 1);
    for (const segment of extraction.body.segments)
      assert.equal(extraction.body.text.slice(segment.start, segment.end), segment.text);
  }
}
for (const [name, mime, contentBase64] of [
  ["malformed-pdf", "application/pdf", Buffer.from("not a PDF").toString("base64")],
  [
    "malformed-docx",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    Buffer.from("not a ZIP").toString("base64"),
  ],
  ["invalid-utf8", "text/plain", Buffer.from([255, 254, 255]).toString("base64")],
  ["invalid-base64", "text/plain", "!invalid!"],
  ["text-limit", "text/plain", Buffer.from("x".repeat(500_001)).toString("base64")],
  ["source-limit", "text/plain", Buffer.alloc(10 * 1024 * 1024 + 1, "x").toString("base64")],
]) {
  const result = await run({ type: "extract-source", jobId: name, mime, contentBase64 });
  assert.equal(result.status, 422, name);
}
console.log(JSON.stringify(measurements, null, 2));
console.log(
  "DOCX, UTF-8, PDF citation offsets, repeated text, multi-page order, Unicode, escaping, deterministic identity, and limits passed.",
);
await writeFile(new URL("measurements.json", output), JSON.stringify(measurements, null, 2));

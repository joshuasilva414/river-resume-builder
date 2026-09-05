import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";

const root = "/opt/tectonic-cache";
const bundle = "6ffe055852f8faf66c0acbe1a7fb27f87b869a90bad1204f3bf4d9683f597c7c";
const hashFiles = await readdir(join(root, "tectonic/bundles/hashes"));
const bundleFile = hashFiles.find((name) => name.endsWith(".tar"));
assert.ok(bundleFile, "Expected the pinned Tectonic bundle cache");
assert.equal(
  (await readFile(join(root, "tectonic/bundles/hashes", bundleFile), "utf8")).trim(),
  bundle,
  "The upstream TeX bundle changed; review before updating the pin",
);
const hashes = [];
async function visit(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await visit(path);
    else
      hashes.push([
        relative(root, path),
        createHash("sha256")
          .update(await readFile(path))
          .digest("hex"),
      ]);
  }
}
await visit(root);
hashes.sort(([a], [b]) => a.localeCompare(b));
await writeFile(
  "/app/resources.json",
  JSON.stringify(
    {
      compiler: "tectonic@0.17.0",
      bundle,
      fonts: "fonts-lmodern@2.005-1",
      cacheDigest: createHash("sha256").update(JSON.stringify(hashes)).digest("hex"),
      files: hashes,
    },
    null,
    2,
  ),
);

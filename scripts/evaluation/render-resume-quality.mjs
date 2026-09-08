import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(process.argv[2] ?? "test-results/v1.2.1-comparison");
const docker = process.env.DOCKER_PATH ?? "/Applications/Docker.app/Contents/Resources/bin/docker";
const container = process.env.RIVER_TEST_CONTAINER ?? "river-v121-comparison";
const results = [];
for (const dataset of ["fictional-one-page", "fictional-two-page", "private/personal-comparison"]) {
  for (const theme of ["classic", "minimal", "technical"])
    for (const layout of ["classic", "compact"]) {
      const prefix = resolve(root, dataset, `${theme}-${layout}`);
      const job = await readFile(`${prefix}.json`, "utf8");
      const code =
        'let chunks=[];for await(const c of process.stdin)chunks.push(c);const response=await fetch("http://127.0.0.1:8080/jobs",{method:"POST",headers:{"content-type":"application/json"},body:Buffer.concat(chunks)});console.log(JSON.stringify({status:response.status,body:await response.json()}));';
      const response = await new Promise((resolve, reject) => {
        const child = spawn(
          docker,
          ["exec", "-i", container, "node", "--input-type=module", "-e", code],
          { stdio: ["pipe", "pipe", "inherit"] },
        );
        let output = "";
        child.stdout.on("data", (chunk) => {
          output += chunk;
        });
        child.on("error", reject);
        child.on("close", (status) => {
          if (status !== 0) return reject(new Error(`Compiler transport failed (${status}).`));
          try {
            resolve(JSON.parse(output));
          } catch (error) {
            reject(error);
          }
        });
        child.stdin.end(job);
      });
      if (response.status !== 200)
        throw Error(`Compiler failed for ${dataset}/${theme}/${layout}: HTTP ${response.status}`);
      const output = response.body;
      const pdf = Buffer.from(output.pdfBase64, "base64");
      await writeFile(`${prefix}.pdf`, pdf);
      await writeFile(`${prefix}.tex`, output.tex);
      await writeFile(`${prefix}-extracted.txt`, output.extractedText);
      await writeFile(`${prefix}-validation.json`, JSON.stringify(output.validation, null, 2));
      const result = {
        dataset,
        theme,
        layout,
        pages: output.validation.pageCount,
        passed: output.validation.passed,
        warnings: output.validation.warnings,
        renderer: output.rendererVersion,
        sha256: createHash("sha256").update(pdf).digest("hex"),
        durationMs: output.durationMs,
      };
      results.push(result);
      console.log(JSON.stringify(result));
    }
}
await writeFile(
  resolve(root, "local-compiler-results.json"),
  JSON.stringify(
    {
      origin: "Local compiler layout evaluation; normal hosted workflow acceptance is separate.",
      results,
    },
    null,
    2,
  ),
);
if (results.some((result) => !result.passed)) process.exitCode = 1;

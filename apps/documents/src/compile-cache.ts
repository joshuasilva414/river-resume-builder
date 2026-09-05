import { createHash } from "node:crypto";
import { CompiledResult, DocumentJob } from "@river/contracts";
import { canonicalJson } from "@river/domain";
import { Schema } from "effect";

/** A bounded warm-process cache. Validation runs always execute the compiler independently. */
export class CompileCache {
  private readonly entries = new Map<string, { body: string; bytes: number; expiresAt: number }>();
  private bytes = 0;

  constructor(
    private readonly runtimeIdentity: string,
    private readonly maxBytes = 16 * 1024 * 1024,
    private readonly ttlMs = 120_000,
    private readonly now = Date.now,
  ) {}

  key(input: unknown): string | null {
    let job: DocumentJob;
    try {
      job = Schema.decodeUnknownSync(DocumentJob)(input);
    } catch {
      return null;
    }
    if (job.type !== "compile-resume") return null;
    const { jobId: _jobId, ...renderInput } = job;
    return createHash("sha256")
      .update(canonicalJson({ runtimeIdentity: this.runtimeIdentity, renderInput }))
      .digest("hex");
  }

  get(key: string): string | null {
    this.expire();
    const entry = this.entries.get(key);
    if (!entry) return null;
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.body;
  }

  put(key: string, body: string): void {
    this.expire();
    const bytes = Buffer.byteLength(body);
    if (bytes > this.maxBytes) return;
    try {
      const result = Schema.decodeUnknownSync(CompiledResult)(JSON.parse(body));
      if (!result.validation.passed) return;
    } catch {
      return;
    }
    this.remove(key);
    for (const existing of this.entries.keys()) {
      if (this.bytes + bytes <= this.maxBytes) break;
      this.remove(existing);
    }
    this.entries.set(key, { body, bytes, expiresAt: this.now() + this.ttlMs });
    this.bytes += bytes;
  }

  private expire(): void {
    const now = this.now();
    for (const [key, entry] of this.entries) if (entry.expiresAt <= now) this.remove(key);
  }

  private remove(key: string): void {
    const entry = this.entries.get(key);
    if (entry) this.bytes -= entry.bytes;
    this.entries.delete(key);
  }
}

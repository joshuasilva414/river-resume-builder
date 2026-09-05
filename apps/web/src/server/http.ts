import type { ProblemDetails } from "@river/contracts";
import { ApplicationError } from "@river/domain";
import { Effect } from "effect";

export function jsonResult<A>(
  result: { ok: true; value: A } | { ok: false; error: ProblemDetails },
  status = 200,
) {
  return Response.json(result.ok ? result.value : result.error, {
    status: result.ok ? status : result.error.status,
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Type": result.ok ? "application/json" : "application/problem+json",
    },
  });
}

/** Bound the actual body stream; Content-Length alone is not a trustworthy limit. */
export const readJson = (request: Request, limit = 15 * 1024 * 1024) =>
  Effect.tryPromise({
    try: async (): Promise<unknown> => {
      const origin = request.headers.get("origin");
      if (
        !request.headers.get("authorization")?.startsWith("Bearer ") &&
        origin !== new URL(request.url).origin
      )
        throw Error("Same-origin request required");
      if (!request.headers.get("content-type")?.startsWith("application/json"))
        throw Error("JSON required");
      const reader = request.body?.getReader();
      if (!reader) throw Error("Missing body");
      const chunks: Uint8Array[] = [];
      let length = 0;
      try {
        for (;;) {
          const item = await reader.read();
          if (item.done) break;
          length += item.value.length;
          if (length > limit) {
            await reader.cancel();
            throw Error("Body too large");
          }
          chunks.push(item.value);
        }
      } finally {
        reader.releaseLock();
      }
      const bytes = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    },
    catch: () =>
      new ApplicationError({
        code: "InvalidInput",
        message: "Provide a valid JSON request within the 15 MiB request limit.",
      }),
  });

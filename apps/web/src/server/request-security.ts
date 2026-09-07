import type { Env } from "./env";

export const RPC_BODY_LIMIT = 15 * 1024 * 1024;
export const NONCE_HEADER = "x-river-csp-nonce";

/** Read before dispatch so framework JSON/form parsing never receives an oversized RPC body. */
async function boundedBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const item = await reader.read();
      if (item.done) break;
      length += item.value.byteLength;
      if (length > RPC_BODY_LIMIT) {
        await reader.cancel();
        return null;
      }
      chunks.push(item.value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

/** Central boundary for every dynamic response, including redirects and framework errors. */
export async function secureRequest(
  request: Request,
  env: Pick<Env, "ENVIRONMENT" | "APP_URL">,
  dispatch: (request: Request) => Response | Promise<Response>,
) {
  const url = new URL(request.url);
  const local =
    env.ENVIRONMENT === "development" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(24))));
  const traceId = crypto.randomUUID();
  let response: Response;
  try {
    if (url.protocol !== "https:" && !local) {
      // Use the configured origin, never a client-controlled Host or forwarding header.
      const destination = new URL(env.APP_URL);
      destination.protocol = "https:";
      destination.pathname = url.pathname;
      destination.search = url.search;
      response = Response.redirect(destination.href, 308);
    } else {
      const headers = new Headers(request.headers);
      // Replace any caller-provided nonce before the request-scoped router reads it.
      headers.set(NONCE_HEADER, nonce);
      let body: Uint8Array<ArrayBuffer> | undefined;
      if (url.pathname.startsWith("/_serverFn/") && request.method === "POST" && request.body) {
        const bytes = await boundedBody(request);
        if (!bytes) {
          response = new Response("Request body exceeds the 15 MiB limit.", { status: 413 });
          return finish(response);
        }
        body = bytes;
        headers.delete("content-length");
      }
      response = await dispatch(new Request(request, { headers, ...(body ? { body } : {}) }));
    }
  } catch {
    // Exceptions may include URLs, credentials or private inputs. Log only a fixed category.
    console.error(JSON.stringify({ event: "river.request.failed", traceId }));
    response = new Response("Request failed.", { status: 500 });
  }
  return finish(response);

  function finish(original: Response) {
    const result = new Response(original.body, original);
    const headers = result.headers;
    const html = headers.get("content-type")?.includes("text/html");
    const publicDocs = url.pathname === "/docs" || url.pathname.startsWith("/docs/");
    // Static assets are served by the asset binding before this Worker. Unknown paths stay private.
    if (!publicDocs || !html || result.status >= 400 || headers.has("set-cookie")) {
      headers.set("Cache-Control", "private, no-store");
      headers.delete("CDN-Cache-Control");
      headers.delete("Cloudflare-CDN-Cache-Control");
    }
    if (url.protocol === "https:") headers.set("Strict-Transport-Security", "max-age=31536000");
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Referrer-Policy", "no-referrer");
    headers.set("X-Request-Id", traceId);
    console.info(JSON.stringify({ event: "river.request", traceId, status: result.status }));
    if (html) {
      headers.set("X-Frame-Options", "DENY");
      headers.set(
        "Content-Security-Policy",
        [
          "default-src 'self'",
          local
            ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
            : `script-src 'self' 'nonce-${nonce}'`,
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: blob:",
          "font-src 'self' data:",
          `connect-src 'self'${local ? " ws: wss:" : ""}`,
          "worker-src 'self' blob:",
          "frame-src 'self' blob:",
          "object-src 'none'",
          "base-uri 'none'",
          "form-action 'self'",
          "frame-ancestors 'none'",
        ].join("; "),
      );
    } else if (headers.get("content-type")?.includes("application/pdf")) {
      headers.set("Content-Security-Policy", "frame-ancestors 'self'");
      headers.set("X-Frame-Options", "SAMEORIGIN");
    }
    return result;
  }
}

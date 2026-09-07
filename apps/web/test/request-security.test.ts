import { expect, it, vi } from "vitest";
import { NONCE_HEADER, RPC_BODY_LIMIT, secureRequest } from "../src/server/request-security";

const settings = { ENVIRONMENT: "production" as const, APP_URL: "https://river.example.test" };
const html = () => new Response("<html></html>", { headers: { "Content-Type": "text/html" } });

it.each([
  "/sign-in",
  "/reset-password?token=fake",
  "/jobs",
  "/api/auth/sign-in/email",
  "/_serverFn/fn",
])("redirects HTTP %s before rendering or consuming a body", async (path) => {
  const dispatch = vi.fn(html);
  const request = new Request(`http://river.example.test${path}`, {
    method: "POST",
    body: "secret",
  });
  const response = await secureRequest(request, settings, dispatch);
  expect(response.status).toBe(308);
  expect(response.headers.get("location")).toBe(`https://river.example.test${path}`);
  expect(request.bodyUsed).toBe(false);
  expect(dispatch).not.toHaveBeenCalled();
  expect(response.headers.get("cache-control")).toBe("private, no-store");
});

it("uses the configured host and only permits HTTP for explicit loopback development", async () => {
  const request = new Request("http://untrusted.test/sign-in");
  expect((await secureRequest(request, settings, html)).headers.get("location")).toBe(
    "https://river.example.test/sign-in",
  );
  const local = { ...settings, ENVIRONMENT: "development" as const };
  expect((await secureRequest(new Request("http://localhost/sign-in"), local, html)).status).toBe(
    200,
  );
  expect((await secureRequest(request, local, html)).status).toBe(308);
});

it.each([200, 401, 403, 404, 500])(
  "prevents storage of private HTML and RPC responses (%s)",
  async (status) => {
    for (const path of ["/jobs", "/_serverFn/session", "/api/auth/get-session"]) {
      const response = await secureRequest(
        new Request(`${settings.APP_URL}${path}`),
        settings,
        () =>
          new Response("private", {
            status,
            headers: { "Cache-Control": "public, max-age=600", "CDN-Cache-Control": "public" },
          }),
      );
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(response.headers.has("cdn-cache-control")).toBe(false);
      expect(response.headers.get("strict-transport-security")).toBe("max-age=31536000");
    }
  },
);

it("sets per-request CSP nonces without trusting caller headers; preserves cookies and PDF embedding", async () => {
  const nonces: string[] = [];
  for (let i = 0; i < 2; i++) {
    const response = await secureRequest(
      new Request(`${settings.APP_URL}/sign-in`, { headers: { [NONCE_HEADER]: "forged" } }),
      settings,
      (request) => {
        nonces.push(request.headers.get(NONCE_HEADER) ?? "");
        const response = html();
        response.headers.append("Set-Cookie", "first=1; Secure; HttpOnly");
        response.headers.append("Set-Cookie", "second=2; Secure; HttpOnly");
        return response;
      },
    );
    expect(response.headers.get("content-security-policy")).toContain(`'nonce-${nonces[i]}'`);
    expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.getSetCookie()).toHaveLength(2);
  }
  expect(nonces[0]).not.toBe(nonces[1]);
  expect(nonces).not.toContain("forged");
  const pdf = await secureRequest(
    new Request(`${settings.APP_URL}/api/checkpoints/id/pdf`),
    settings,
    () => new Response("pdf", { headers: { "Content-Type": "application/pdf" } }),
  );
  expect(pdf.headers.get("content-security-policy")).toBe("frame-ancestors 'self'");
  expect(pdf.headers.get("cache-control")).toBe("private, no-store");
});

it("preserves public documentation caching while keeping errors private", async () => {
  const response = await secureRequest(
    new Request(`${settings.APP_URL}/docs/start`),
    settings,
    () =>
      new Response("docs", {
        headers: { "Content-Type": "text/html", "Cache-Control": "public, max-age=300" },
      }),
  );
  expect(response.headers.get("cache-control")).toBe("public, max-age=300");
  const failure = await secureRequest(
    new Request(`${settings.APP_URL}/docs/missing`),
    settings,
    () => new Response("missing", { status: 404 }),
  );
  expect(failure.headers.get("cache-control")).toBe("private, no-store");
});

it("caps the actual RPC stream even with a false Content-Length and cancels before dispatch", async () => {
  const cancel = vi.fn();
  const dispatch = vi.fn(html);
  const request = new Request(`${settings.APP_URL}/_serverFn/fn`, {
    method: "POST",
    headers: { "Content-Type": "multipart/form-data; boundary=test", "Content-Length": "1" },
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(RPC_BODY_LIMIT + 1));
      },
      cancel,
    }),
  });
  const response = await secureRequest(request, settings, dispatch);
  expect(response.status).toBe(413);
  expect(cancel).toHaveBeenCalled();
  expect(dispatch).not.toHaveBeenCalled();
  expect(response.headers.get("cache-control")).toBe("private, no-store");
});

it("passes bounded RPC bytes unchanged and sanitizes unexpected boundary errors", async () => {
  const body = '{"payload":"fictional input"}';
  const response = await secureRequest(
    new Request(`${settings.APP_URL}/_serverFn/fn`, { method: "POST", body }),
    settings,
    async (request) => new Response(await request.text()),
  );
  expect(await response.text()).toBe(body);
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const failure = await secureRequest(
      new Request(`${settings.APP_URL}/private?payload=secret`),
      settings,
      () => {
        throw Error("private-secret");
      },
    );
    expect(failure.status).toBe(500);
    expect(await failure.text()).toBe("Request failed.");
    expect(failure.headers.get("cache-control")).toBe("private, no-store");
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret");
    expect(JSON.stringify(log.mock.calls)).toContain(failure.headers.get("x-request-id"));
  } finally {
    log.mockRestore();
  }
});

import { expect, it } from "vitest";
import { sanitizedRequestLog } from "../src/server/security-telemetry";

it("retains only status and a trace identifier, dropping URL metadata and arbitrary fields", () => {
  const traceId = crypto.randomUUID();
  expect(
    sanitizedRequestLog({
      event: "river.request",
      traceId,
      status: 403,
      url: "/reset-password/private-secret?payload=private",
      headers: { authorization: "secret" },
      exception: "private",
    }),
  ).toEqual({ event: "river.request", traceId, status: 403 });
  for (const value of [
    null,
    "private",
    { event: "arbitrary", traceId, status: 200 },
    { event: "river.request", traceId: "secret", status: 200 },
    { event: "river.request", traceId, status: "private" },
  ])
    expect(sanitizedRequestLog(value)).toBeNull();
});

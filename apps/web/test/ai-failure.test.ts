import { expect, it } from "vitest";
import { classifyAiFailure } from "../src/server/ai-failure";

it("distinguishes timeouts from unknown failures without copying error text", () => {
  expect(
    classifyAiFailure(new DOMException("private-test-source", "TimeoutError")).diagnostic,
  ).toEqual({ category: "timeout", httpStatus: null });
  const failure = classifyAiFailure(new Error("private-test-key"));
  expect(failure.diagnostic).toEqual({ category: "request_failed", httpStatus: null });
  expect(JSON.stringify(failure)).not.toContain("private-test");
});

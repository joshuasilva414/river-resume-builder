import { introspectWorkflowInstance } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { newId } from "@river/domain";
import { expect, it } from "vitest";
import { classifyAiFailure } from "../src/server/ai-failure";

it.each([
  [400, "request_rejected", "rejected the request"],
  [401, "authorization", "could not authorize"],
  [429, "rate_limit", "usage limit"],
  [503, "provider_unavailable", "temporarily unavailable"],
])(
  "retains safe diagnostics for HTTP %i across a real Workflow step",
  async (status, category, message) => {
    const id = newId();
    await using workflow = await introspectWorkflowInstance(env.AI_FAILURE_WORKFLOW, id);
    await env.AI_FAILURE_WORKFLOW.create({ id, params: { status } });
    await workflow.waitForStatus("complete");
    const result = await workflow.getOutput();
    expect(result).toEqual({ code: "Unavailable", message: expect.stringContaining(message) });
    const stepResult = await workflow.waitForStepResult({ name: "generate-validate-persist" });
    expect(stepResult).toEqual({
      failure: {
        message: expect.stringContaining(message),
        diagnostic: { category, httpStatus: status },
      },
    });
    expect(JSON.stringify({ result, stepResult })).not.toContain("private-test");
  },
);

it("distinguishes timeouts from unknown failures without copying error text", () => {
  expect(
    classifyAiFailure(new DOMException("private-test-source", "TimeoutError")).diagnostic,
  ).toEqual({ category: "timeout", httpStatus: null });
  const failure = classifyAiFailure(new Error("private-test-key"));
  expect(failure.diagnostic).toEqual({ category: "request_failed", httpStatus: null });
  expect(JSON.stringify(failure)).not.toContain("private-test");
});

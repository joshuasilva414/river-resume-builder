import { createFileRoute } from "@tanstack/react-router";
import { Effect } from "effect";
import { bindings } from "~/server/env";
import { Actor, execute } from "~/server/services";

export const Route = createFileRoute("/api/v1/me")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const result = await execute(
          bindings(),
          request.headers,
          Effect.gen(function* () {
            const actor = yield* Actor;
            return {
              id: actor.id,
              kind: actor.kind,
              scopes: actor.kind === "agent" ? actor.scopes : [],
            };
          }),
          "identity",
        );
        return Response.json(result.ok ? result.value : result.error, {
          status: result.ok ? 200 : result.error.status,
          headers: {
            "Cache-Control": "private, no-store",
            "Content-Type": result.ok ? "application/json" : "application/problem+json",
          },
        });
      },
    },
  },
});

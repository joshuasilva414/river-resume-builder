/** Former evidence and file-only extraction payloads must never enter the replacement model. */
export const retiredWorkspaceEndpoint = () =>
  Response.json(
    {
      type: "https://river.jilva.dev/problems/workspace-replaced",
      title: "RIVER_WORKSPACE_REPLACED",
      status: 410,
      detail:
        "This interface was retired. Use /api/v2 fact, context, content, template and résumé records. Source submissions require extracted text. Historical records remain in the read-only archive.",
      replacement: "/api/v2/facts",
      archive: "/archive",
    },
    {
      status: 410,
      headers: { "Content-Type": "application/problem+json", "Cache-Control": "private, no-store" },
    },
  );

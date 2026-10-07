# River replacement delivery

The user-approved replacement is implemented on `feature/river-editor-replacement`, based on the visual-editor demo branch. [SPEC.md](SPEC.md) defines the product. [The implementation record](docs/implementation/river-replacement.md) contains milestones, local cutover evidence, browser acceptance, Paper references, and limitations.

1. Establish browser-worker React PDF rendering and the shared document resolver.
2. Add typed JSON records, immutable versions/exports, and owner-scoped legacy archival.
3. Build the Fact Bank, browser import preview, reusable content, and REST/MCP contracts.
4. Replace both editors with production visual template and résumé workflows.
5. Integrate PDF retention, history, explicit suggestions, and optional scorecards.
6. Archive the local previous workspace and verify retained PDF access.
7. Remove the old editor, LaTeX, review/schema graph machinery, and container dependencies.
8. Validate the replacement and update architecture, APIs, development setup, and the cutover runbook.

Commit between milestones. Preserve unrelated documentation edits. This implementation authorizes local validation only. Production deployment, merging, and remote container decommission remain separate actions governed by the [cutover runbook](docs/implementation/workspace-cutover.md).

Historical V1/V1.1/V1.2 delivery records describe prior hosted releases. They do not authorize restoring retired workflows or deploying this branch.

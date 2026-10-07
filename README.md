# River

Private workspaces for turning candidate facts into reusable content, tailored résumés, and browser-generated PDFs.

This branch implements the visual workspace replacement. It has not been deployed. Existing hosted releases remain unchanged. See the [implementation and acceptance record](docs/implementation/river-replacement.md) and [cutover runbook](docs/implementation/workspace-cutover.md).

## Run locally

Use Node 24 and pnpm 10.33.0. CI pins Node 24.20.0. Docker is no longer required.

```sh
pnpm install --frozen-lockfile # 1
pnpm setup:local               # 2
pnpm db:migrate:local          # 3
pnpm dev                      # 4
```

1. Install the pinned workspace dependencies.
2. Create a local authentication secret, preserving existing `.dev.vars`.
3. Apply local D1 migrations through the replacement model.
4. Open `http://127.0.0.1:3000`. Only the web application runs; PDF rendering and file parsing run in the active browser.

`http://localhost:3000` also works. Development authentication accepts both loopback
hostnames on the configured port. Verification/reset links use `APP_URL`; sessions
are separate for each hostname. Hosted authentication trusts only its configured origin.

Create an account admitted by `ADMIN_EMAIL` or `ALLOWED_EMAILS`. Development verification and password-reset mail is retained privately in local R2. Use `pnpm auth:mail -- you@example.test` to read its link. This adapter is restricted to development and a loopback origin.

AI requires a personal provider connection and default model in Settings, plus the server encryption secret. Optional scorecards require `ATS_SCREENER_ORIGIN`. Missing providers do not block manual authoring, saving, or export. See [workspace architecture](docs/adr/0016-use-facts-visual-documents-and-browser-pdf.md).

## Workflows

- `/facts`: typed facts grouped by employer, project, education, profile, or a custom context.
- `/content`: reusable bullets, skills, entries, and sections. Insertion copies values.
- `/templates`: custom visual structures, repeating entry layouts, labels, and formatting.
- `/resumes`: captured templates, direct authoring, contextual suggestions, versions, and private PDF exports.
- `/sources` and `/jobs`: retained candidate sources and job descriptions.
- `/archive`: read-only previous workspace, including available historical PDF bytes.

The editor supports desktop keyboard and mouse use. Smaller screens support browsing and retained downloads. OCR, collaborative editing, automatic fact propagation, template-design AI, and old-template conversion are excluded. The bundled document fonts support Latin text; unsupported glyphs fail the PDF completeness check instead of producing a successful export.

## Verify

| Command | Purpose |
| --- | --- |
| `pnpm lint` | Formatting and lint across active packages |
| `pnpm check` | Strict TypeScript across four packages |
| `pnpm test` | Domain, Workers/D1, API/MCP, and recovery checks |
| `pnpm test:deployment` | Environment and bundle guards |
| `pnpm --filter @river/web build` | Production web bundle and dedicated PDF worker |

The authenticated development fixture `/demo/pdf-proof` checks repeated entries, fonts, rich text, Unicode handling, multi-page PDFs, and browser PDF/DOCX/text imports. It never saves fictional candidate records. Production URLs do not expose this fixture.

## Code boundaries

| Location | Responsibility |
| --- | --- |
| `apps/web` | React/Tiptap UI, browser PDF worker/parsers, authentication, server AI/scoring and transports |
| `packages/domain/src/workspace` | Typed records, copy/mapping commands, shared document resolver |
| `packages/contracts` | Retained authentication/source contracts; workspace contracts are Zod schemas in domain |
| `packages/db` | Drizzle, D1 migrations, atomic commands, archives, private artifact manifests |

Sources, exports, and backups use private R2. D1 stores versioned JSON aggregates and immutable snapshots. Accounts, settings, sources, and job targets survive the cutover. Historical editor data is archived without conversion or re-rendering.

See [API and MCP](docs/implementation/workspace-api.md), [contributing](contributions.md), and [CI/deployment](docs/implementation/ci-cd.md). Deployment, merge, and remote container decommission require separate authorization.

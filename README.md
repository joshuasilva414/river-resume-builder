# River

Private, evidence-first résumé tailoring for Joshua Silva. Product behavior lives in [SPEC.md](SPEC.md); architecture and delivery gates live in [PLAN.md](PLAN.md).

**Implementation status:** authenticated PDF output, access management, immutable source intake, and the evidence bank work locally and on staging. Claims include exact citations, pinned contexts, review decisions, history, archive/restore, and reviewed duplicate merges. REST and MCP share scoped application services. Manual job targets, posting snapshots, requirement maps, and pinned evidence selections also work. Seven reusable content types and the structured editor now support exact library revisions, local wording, copy, explicit promotion, conflict branches, and real PDF previews. Exact saved checkpoints, individual evidence acknowledgments, three fixed template packs, retained export files, and basic export history work on staging. Reviewed job-analysis proposals are implemented; live OpenAI generation still needs a configured key and provider acceptance check. Reviewed placement wording is also implemented, with exact-input checks and local acceptance. Source claim proposals and source-backed clarification tracking are implemented with independent Draft acceptance and exact citations. Advisory duplicate comparisons support independent review, optional manual-decision attribution, and history through both claims. Template refinement and ATS scoring remain unfinished. This is not the MVP.

## Run locally

Use Node **24.20.0**, pnpm **10.33.0**, and a running Docker Desktop engine. All application dependencies are pinned in `pnpm-lock.yaml`.

```sh
pnpm install --frozen-lockfile
pnpm setup:local
pnpm db:migrate:local
WRANGLER_DOCKER_BIN=/Applications/Docker.app/Contents/Resources/bin/docker pnpm dev
```

1. Install the workspace dependencies from the lockfile.
2. Generate a local authentication secret, preserving any existing `.dev.vars`.
3. Apply the D1 migrations to the local database.
4. Start the web app on `http://127.0.0.1:3000` and the private document Worker on port 8788. The first Container build downloads and pins the compiler resources. On Linux, use your installed Docker CLI path.

Create the allowlisted Owner account in the local sign-in screen. Development verification and reset messages are written to private local R2 instead of sending email. Retrieve `river-local-artifacts/development/auth/latest.json` with `wrangler r2 object get --local`; open its verification link in the same local browser. This delivery adapter is restricted to development and a loopback application origin.

## Verify

- `pnpm lint`: Biome across the workspace.
- `pnpm check`: strict TypeScript across all six packages.
- `pnpm test`: domain/composition and Workers/D1 service tests.
- `pnpm test:documents`: build a Linux/amd64 image, run offline PDF/DOCX fixtures with a 512 MiB memory limit and one CPU, then remove the temporary test Container. Results are under `apps/documents/test-results/`.
- `pnpm --filter @river/web build`: build the application for Workers.

GitHub Actions runs these checks. The workflow has been added but has not run on GitHub yet.

## Workspace boundaries

| Location | Responsibility |
| --- | --- |
| `apps/web` | TanStack Start UI, Owner/Agent authentication, Effect services, Workflows, REST/MCP transports |
| `apps/documents` | Private document Worker, Container, Tectonic, PDF.js and Mammoth adapters |
| `packages/domain` | Domain values, invariants, identifiers and typed failures |
| `packages/contracts` | Effect Schema request/result contracts |
| `packages/db` | Drizzle schema, migrations, D1 repositories and atomic commands |
| `packages/templates` | Deterministic LaTeX composition and synthetic fixtures |

## Deployment and current limitations

The Owner is `joshuasilva414@gmail.com`. Resources belong exclusively to the personal Cloudflare account configured in both Wrangler files. The ACM UTSA workspace is outside this project.

Staging: [river-staging.jilva.workers.dev](https://river-staging.jilva.workers.dev). The intended production hostname is `river.jilva.dev`; the production application has not been deployed.

See [the runtime proof](docs/implementation/phase-0.md) for measurements, exact resource identities, reproducible deployment steps, and remaining acceptance checks. See [the implementation ledger](docs/implementation/status.md) before continuing work.

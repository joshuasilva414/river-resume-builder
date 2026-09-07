# River

Private workspaces for turning job postings and experience into tailored résumés, ready to review and export. Product behavior lives in [SPEC.md](SPEC.md); architecture and delivery gates live in [PLAN.md](PLAN.md).

**Implementation status:** V1 and the private-account extension are deployed to staging and production. See the [implementation status](docs/implementation/status.md) and [multi-user operation](docs/implementation/multi-user.md) for verification and account admission.

See [Contributing to River](contributions.md) for the Git workflow, local checks, and release process. [CI and automatic deployments](docs/implementation/ci-cd.md) covers Cloudflare settings and release safeguards.

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

Create an account using `ADMIN_EMAIL` or an address in the comma-separated `ALLOWED_EMAILS` configuration. Development verification and reset messages are written to private local R2 instead of sending email. Run `pnpm auth:mail -- you@example.test` to read the latest local message for that address and open its verification link in the same local browser. This delivery adapter is restricted to development and a loopback application origin.

## Verify

- `pnpm lint`: Biome across the workspace.
- `pnpm check`: strict TypeScript across all six packages.
- `pnpm test`: domain/composition and Workers/D1 service tests.
- `pnpm test:documents`: build a Linux/amd64 image, run offline PDF/DOCX fixtures with a 512 MiB memory limit and one CPU, then remove the temporary test Container. Results are under `apps/documents/test-results/`.
- `pnpm --filter @river/web build`: build the application for Workers.

GitHub Actions runs verification on pull requests and pushes to `dev`, `staging`, and `main`. Cloudflare independently checks and deploys pushes to `staging` and `main`; see [the contribution guide](contributions.md#cloudflare-deployments) for deployment triggers and exclusions.

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

`ADMIN_EMAIL` identifies the service administrator; `ALLOWED_EMAILS` admits additional private accounts. The administrator has no cross-workspace content access. See [multi-user operation](docs/implementation/multi-user.md) for admission, migration and usage limits. Resources belong exclusively to the personal Cloudflare account configured in both Wrangler files. The ACM UTSA workspace is outside this project.

Staging: [river-staging.jilva.workers.dev](https://river-staging.jilva.workers.dev). Production: [river.jilva.dev](https://river.jilva.dev).

See [the runtime proof](docs/implementation/phase-0.md) for measurements, exact resource identities, reproducible deployment steps, and remaining acceptance checks. See [the implementation ledger](docs/implementation/status.md) before continuing work.

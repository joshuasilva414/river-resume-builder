# Contributing to River

Use pull requests to move changes through development, staging, and production. CI (continuous integration) checks the code in GitHub Actions. CD (continuous deployment) publishes changes through Cloudflare Workers Builds.

## Branches

| Branch | Purpose | Deployment |
| --- | --- | --- |
| Feature or fix branch | Develop one focused change | None; opening a PR runs CI |
| `dev` | Integrate development work | CI only; no hosted environment |
| `staging` | Validate a release candidate | Automatically deploys to [staging](https://river-staging.jilva.workers.dev) |
| `main` | Release to production | Automatically deploys to [production](https://river.jilva.dev) |

The normal flow is **feature branch → dev → staging → main**. These three long-lived branches exist on `origin`.

## Develop a change

1. Run `git fetch origin` to update your remote branch references.
2. Run `git switch --no-track -c feature/short-description origin/dev` to create a branch from the latest development code. Use a descriptive name, such as `fix/export-validation`.
3. Follow [Run locally](README.md#run-locally). Use Node **24.20.0**, pnpm **10.33.0**, without a document container. Install dependencies with `pnpm install --frozen-lockfile`.
4. Make a focused change. Add tests for changed behavior and update any affected documentation. Keep credentials, local environment files, and generated artifacts out of commits.
5. Run the relevant local checks below. Review your diff, stage the intended files, and commit them.
6. Run `git push -u origin feature/short-description`, using your actual branch name. Open a PR with **`dev` as its base**.
7. Describe the problem, the resulting behavior, and the checks you ran. Resolve the application check before merging.

## Local checks

Run commands from the repository root.

| Command | What it verifies |
| --- | --- |
| `pnpm lint` | Biome formatting and lint rules |
| `pnpm check` | TypeScript across the workspace |
| `pnpm test` | Package, Workers/D1, and recovery tests |
| `pnpm test:deployment` | Environment and generated-bundle deployment guards |
| `pnpm ci:build staging --bundle-only` | Staging web build, resource-binding validation, and Wrangler dry run |
| `pnpm ci:build production --bundle-only` | Production web build, resource-binding validation, and Wrangler dry run |

To run the full Cloudflare build checks locally, use `pnpm ci:build staging`. This runs all tests listed above and builds the staging bundle without deploying it. The production equivalent is `pnpm ci:build production`.

Run staging and production builds sequentially: they share `apps/web/dist`. Leave `CLOUDFLARE_ENV` unset when invoking these scripts; they select the environment for the build and keep tests on local bindings. Browser rendering/import fixtures are available locally at `/demo/pdf-proof` and never save candidate records.

## Promote a release

For the visual workspace replacement, complete the [cutover runbook](docs/implementation/workspace-cutover.md) before normal promotion. Merge, deployment, and remote decommission require separate authorization.

1. Open a PR from **`dev` into `staging`**. Review the complete release diff and wait for the application check to pass.
2. Merge using **Create a merge commit**. Use merge commits for promotions between long-lived branches so their shared history is preserved; avoid squash or rebase merges for these promotions.
3. Wait for the Cloudflare staging build for the merged commit to succeed. Check the affected behavior in the hosted staging environment, including authenticated document or export flows when relevant.
4. Open a PR from **`staging` into `main`**. Wait for the application check, then merge with a merge commit.
5. Confirm the Cloudflare production build succeeds for that commit. A green GitHub run alone does not prove that deployment succeeded.

For an urgent production fix, branch from `origin/main` and open a PR into `main`. After release, merge `main` back into `staging`, then merge `staging` into `dev`, using PRs and merge commits. This keeps the fix in future releases. Avoid force-pushing shared branches.

## GitHub CI

The [Verify River workflow](.github/workflows/verify.yml) runs on pull requests, pushes to `dev`, `staging`, and `main`, and manual workflow dispatches.

- **`application`** runs lint, type checks, tests, and deployment-guard tests. It then builds and validates both environment bundles, including Wrangler dry runs.

New runs cancel superseded verification runs for the same branch or PR. GitHub jobs do not have deployment credentials. Required-check branch protection is a separate repository setting; the [operations guide](docs/implementation/ci-cd.md#release-safeguards) lists recommended protections.

## Cloudflare deployments

Cloudflare watches the same repository through two web Worker triggers:

| Branch | Web Worker | Build command | Deploy command |
| --- | --- | --- | --- |
| `staging` | `river-staging` | `pnpm ci:build staging` | `pnpm ci:deploy staging` |
| `main` | `river-production` | `pnpm ci:build production` | `pnpm ci:deploy production` |

Feature branches, PRs, and `dev` do not get Cloudflare preview deployments. Changes limited to `docs/**` and `README.md` do not trigger deployment. Other paths, including this root-level `contributions.md`, are watched. Documentation changes still run GitHub CI.

Cloudflare runs its own checks before deployment; it does not wait for the independent GitHub workflow. Rendering and extraction use browser workers. The deployment no longer builds a document image.

After checks pass, the deployment script:

1. Validates the target account, Worker, database, bucket, service, workflows, and routes against the selected environment.
2. Retains and validates a database backup in that environment's private R2 bucket.
3. Applies pending D1 migrations.
4. Deploys the private telemetry Worker, then the web Worker.
5. Checks that `/sign-in` returns HTTP 200 and an anonymous request to `/api/v1/me` returns HTTP 401.

The dedicated **River automatic deployments** token is stored in Workers Builds. Runtime secrets remain on the Workers. Contributors do not need this token to run GitHub CI or local checks.

## Deployment failures and recovery

Inspect the failing GitHub job or Cloudflare build log before retrying. Cloudflare's scripts stop at the first failed command, but earlier deployment steps may already have changed remote state. Check which steps completed before starting another deployment.

Keep migrations additive and compatible with the currently running app. A Worker rollback does not restore D1 or R2. The replacement requires the reviewed [cutover runbook](docs/implementation/workspace-cutover.md); do not reopen old editor writes after new data has been created.

Avoid overlapping manual and automatic deployments to one environment. Do not cancel a deployment after migrations or publication have begun. Use the [recovery guide](docs/implementation/recovery.md) for backup inspection and restore procedures.

For exact Cloudflare settings, credential scope, and additional release safeguards, see [CI and automatic deployments](docs/implementation/ci-cd.md).

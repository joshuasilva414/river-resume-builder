# CI and automatic deployments

## Branches

| Branch | Purpose | Hosted environment |
| --- | --- | --- |
| `dev` | Integrate development work and run CI | None |
| `staging` | Test release candidates | `river-staging` |
| `main` | Production releases | `river-production`, `https://river.jilva.dev` |

Promote changes with pull requests: feature branch → dev → staging → main. Use merge commits for promotions between these long-lived branches so their ancestry remains shared. A production hotfix must also be merged back into staging and dev.

GitHub Actions runs application and document-container verification on pull requests and pushes to these three branches. Superseded verification runs are canceled. Application verification includes both staging and production builds, validates their resource bindings, and runs Wrangler dry runs. Neither job needs deployment credentials.

## Cloudflare Workers Builds

Connect the **web Worker** for each environment to `joshuasilva414/river-resume-builder`. Each build deploys its private document Worker before its web Worker. Do not create a second independent trigger for the document Worker: independent builds do not guarantee deployment order.

| Setting | Staging | Production |
| --- | --- | --- |
| Worker | `river-staging` | `river-production` |
| Production branch (Cloudflare setting) | `staging` | `main` |
| Root directory | `/` | `/` |
| Build command | `pnpm ci:build staging` | `pnpm ci:build production` |
| Deploy command | `pnpm ci:deploy staging` | `pnpm ci:deploy production` |
| Non-production branch builds | Disabled | Disabled |
| Watch paths | All except `docs/**` and `README.md` | All except `docs/**` and `README.md` |
| `NODE_VERSION` | `24.20.0` | `24.20.0` |
| `PNPM_VERSION` | `10.33.0` | `10.33.0` |

Leave `CLOUDFLARE_ENV` unset in dashboard build variables. The scripts select it only while building the web bundle. This keeps tests on local bindings. The lockfile and package manager are pinned in the repository. Keep the automatic dependency install enabled.

The build runs lint, types, unit/Workers tests, deployment guard tests and offline PDF/DOCX container fixtures before creating the environment-specific Vite bundle. A failing GitHub check alone does not stop an independent Workers Build.

GitHub enforces the 512 MiB / 1 CPU fixture budget. Cloudflare runs the same functional fixtures in the Dockerfile's `fixtures` build stage because its runner cannot launch standalone containers. That stage uses `RUN --network=none`; the deployed image excludes it. Image-build downloads use Cloudflare's host networking override; GitHub fixture containers still use `--network none`.

The deploy command validates the generated account, Worker name, database, bucket, service, workflow and route identities before any remote writes. It then:

1. Retains and verifies a database backup in the environment's private R2 bucket.
2. Applies pending D1 migrations to the explicitly named environment.
3. Deploys the private telemetry sanitizer, then the private document Worker and its container image.
4. Deploys the already-built web bundle.
5. Checks sign-in availability and anonymous denial at the identity API.

Only the private document deploy removes the web Worker's Cloudflare CI name/tag overrides. The web deploy retains Cloudflare's target check. Staging and production generated output shares a local directory, so local builds and deployments must be sequential.

The private telemetry deploy also removes the web-only name/tag overrides. Web logs do not persist raw events: `redact_query_string: true`, `logs.persist: false`, and `invocation_logs: false` are enforced by bundle validation. Each environment sends tail events to its matching `river-telemetry-*` Worker, which persists only a fixed request event, UUID trace identifier, and HTTP status. Unexpected invocation failures use a fixed category. The sanitizer never copies URLs, headers, bodies, exception text or arbitrary console fields. Both telemetry Workers have no public endpoint, data bindings or secrets. Do not restore raw persistence when diagnosing a failure; use response `X-Request-Id` to search sanitized telemetry.

## Credentials and activation

Use a dedicated **user API token** registered with Workers Builds. Scope account permissions to the personal account `a91c30d69981b341efe3b656a263f6da`, and zone permissions to `jilva.dev`. Deployment needs Workers Scripts, D1, Workers R2 Storage, Containers and Cloudchamber write access; account settings read; zone read and Workers Routes write. Workflows are deployed with the Worker. Do not reuse the runtime D1 export token or unrelated projects' deployment tokens.

The deployment token is a build credential. Existing runtime secrets stay on the Workers and do not belong in GitHub Actions, the repository, or the client bundle. Cloudflare's default generated build token does not include every permission needed for River's database/container deployment.

The repository connection was created on 2026-09-06 (`9729d0c8-fd1e-459c-800d-6fd1e9b1c56d`). `origin/dev` and `origin/staging` were created from main `018b823`. Both automatic triggers use the dedicated **River automatic deployments** token, registered as build credential `f54ece86-c68f-4540-90f5-a54441b31028`.

- Staging trigger: `8c4d1265-ef86-4a49-87ad-3f8a3a7dc5f5`.
- Production trigger: `d3742d46-710e-472e-8512-375e1791e72b`.
- Dev has no build trigger or hosted resources.

## Release safeguards

- Require the `application` and `documents` GitHub checks and pull requests on staging/main. Zero required approvals supports a solo maintainer; required checks still catch broken releases.
- Use additive, backward-compatible database migrations. The old Worker remains live while migrations run. Worker rollback does not restore D1 or R2.
- Keep document-service contracts compatible with the previous image during rollout. Wrangler finishing does not prove every container instance has updated.
- Avoid overlapping manual and automatic releases to the same environment. Do not cancel a deployment once migration or publication has begun. Check Cloudflare build history before retrying or deploying locally.
- Configure failure notifications and an uptime check. A successful HTTP check does not replace authenticated document/export acceptance in staging.
- Keep periodic backup restore drills and review scheduled backup health. See [recovery](recovery.md).

References: [Workers Builds configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/), [Containers deployments](https://developers.cloudflare.com/containers/guides/deploy/), and [Vite environments](https://developers.cloudflare.com/workers/vite-plugin/reference/cloudflare-environments/).

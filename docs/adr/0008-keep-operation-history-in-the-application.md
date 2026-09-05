# Keep operation history in the application

Durable background work will be represented by application-owned Operation records in D1. Cloudflare Workflows execute and retry the work, but their identifiers and state remain implementation metadata rather than the UI or audit source of truth. This keeps operation history stable if orchestration infrastructure changes.

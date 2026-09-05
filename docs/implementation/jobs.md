# Manual job tailoring

Updated 2026-09-05. Presentation follows `jobs-design.md`, designed in Paper before implementation.

## Persistence and commands

A Job Target is the revision-checked aggregate. It has current display details, archive state, and one current-posting pointer. Posting snapshots retain their complete original text, provenance URL, captured details, digest, actor, and timestamp. The URL is provenance only; River does not fetch or interpret its page.

Each snapshot starts with an empty immutable workspace revision containing the manual Requirement Map and exact evidence selections. Requirement identities remain stable across edits. The mutable workspace pointer belongs to the snapshot; old workspace revisions remain inspectable. A changed posting creates a new snapshot and empty workspace. It never migrates quotes, requirements, or evidence associations implicitly.

Every mutation commits aggregate changes, workspace/reference rows, audit entries, and permanent idempotency outcomes in a single D1 batch. A guard aborts all dependent writes if the Job Target revision changed. This also prevents a requirement or selection save from racing a new current posting. Reusing a command key with a different payload fails; an identical retry returns the original outcome even after later changes.

Requirements store text, category, Required/Preferred/Unspecified priority, explicit keywords, nullable interpretation confidence, and exact supporting passages. Confidence is stored as 0–1 and displayed as 0–100%; blank stays null. Passages retain their snapshot and UTF-16 start-inclusive/end-exclusive offsets. Lines are derived from the preserved posting text. Repeated quotes require an explicit occurrence. A missing passage is shown as missing, not invented.

An evidence association pins a Claim and Evidence Revision, optionally to a stable requirement. The general job selection does not close a requirement gap. A Claim may support several requirements; the interface counts distinct claims separately from associations. Removing a requirement removes only its current associations. Historical maps, general selections, and canonical evidence remain intact.

Selected wording and review decisions resolve against the pinned Evidence Revision. Later material revisions cannot confer their review state on an older selection. Draft, Needs clarification, stale, archived, and unsupported states remain visible. Archived claims stay outside default evidence search but existing selections remain visible. Updating a selected revision requires comparison and an explicit action.

## Interfaces

- `GET /api/v1/jobs`: query, archived, offset; 50 targets per page.
- `POST /api/v1/jobs`: shared tagged command: create, details, snapshot, archive, requirement, remove-requirement, or selection.
- `GET /api/v1/jobs/:jobId`: current workspace or exact `snapshotId` / `workspaceRevisionId`.
- MCP: `list_jobs`, `get_job`, `job_command`. Tools are filtered by `jobs:read` and `jobs:write`; authorization is checked again during execution.
- TanStack server functions invoke the same Effect services. External agents gain no resume or template mutation capability.

The Owner interface provides active/archive target views, intake, display metadata, immutable posting/history inspection, manual requirements, By requirement / All evidence / Selected views, exact evidence provenance, and archive/restore. Conflicts preserve local values, show a saved/local comparison, and require explicit discard/reload. Failed selection requests retain their logical mutation and idempotency key for retry. No AI controls appear before reviewed proposals work.

## Limits and verification

Posting text is limited to 200,000 characters. A workspace permits 100 requirements, 300 evidence associations, five passages per requirement, and a 1 MiB serialized workspace. Snapshot and workspace-history lists currently show the latest 100 entries; older known revision identities remain readable. Evidence selection details use one joined reference query rather than per-claim queries. Search matches role/company/location literally, including percent and underscore characters.

Twenty-five Workers tests pass, including job snapshot immutability, exact repeated-passage validation, stable requirement identities, general versus requirement associations, preserved historical selections, pinned evidence state, concurrent aggregate writes, archive/restore, ownership, scoped agent commands, and MCP idempotency. All six workspace type checks, package lint checks, and the staging build pass.

Local browser validation completed create, manual requirement with the second repeated quote, selection persistence, concurrent-tab conflict with retained local wording, explicit discard/reload, new posting capture, and historical selection inspection. Desktop rendering was inspected at 1280px. The hosted narrow panel measures 621px; the viewport capability did not apply the requested 390px override to these tabs, so no 390px browser verification is claimed. Paper's 390px designs were reviewed separately by the design subagent.

Hosted acceptance completed target creation, an exact line-two requirement passage, explicit inclusion of archived fixture evidence, saved selection and reload, citation/review-decision inspection, and job archival. The fixture remains in history and outside default job search. The narrow light and dark views showed no horizontal overflow at 621px.

Reviewed requirement extraction, bounded ranking, and the proposal queue are implemented; see [job-analysis.md](job-analysis.md). Live provider generation remains unverified without credentials. Manual tailoring works without a provider.

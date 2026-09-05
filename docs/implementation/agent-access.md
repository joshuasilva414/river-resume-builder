# Hosted Agent Credential acceptance

Verified 2026-09-05 against personal staging after the Owner explicitly approved creation, testing and revocation of a temporary QA credential. No ACM UTSA resources were accessed.

The credential `01a073de-170e-7927-8505-94c97eb79c74` had seven-day expiry and exactly `source:read`, `source:write`, `evidence:read`, `evidence:write`, `jobs:read`, and `jobs:write`. Its secret was shown once, transferred through a private local file, and never printed or committed.

`scripts/probe-agent-access.mjs` verified the deployed REST identity and all 13 exposed MCP tools. A fictional pasted source completed the real extraction Workflow with exact Unicode text. Its protected original downloaded intact. REST creation replayed through MCP returned the same source. A cited Draft created through MCP replayed through REST returned the same claim and preserved its exact processing identity and quoted offsets.

Metadata updates persisted; stale revisions returned 409. Review and archive commands returned 403 without changing the claim, decisions or revision. The credential created a fictional job, replayed its creation, saved a manual requirement and selected the exact Evidence Revision. The job was archived after the checks.

The Owner Settings UI revoked the credential. Subsequent REST `/api/v1/me` and MCP `tools/list` requests both returned 401. The private credential file was removed. The fictional claim was archived through the Owner UI at aggregate revision 2 and remains Draft. Its immutable source and audit history are retained with explicit synthetic labels.

## Evidence and reproduction

Private report: `test-results/agent-access/d37ede9a-bac3-4608-97ca-10b758ebd719/report.json`.

- Source: `01a073e2-634e-7df7-a0b1-661f4490cd0b`.
- Processing result: `01a073e2-634e-7ad9-83a4-d94ee016ca3f`.
- Claim: `01a073e2-9736-74e5-816f-6bac046526c2`.
- Evidence Revision: `01a073e2-9736-7821-b7b7-80053954f898`.
- Archived job: `01a073e2-a4b7-7de0-84f0-de4e1e435eef`.

For an explicitly approved future run, create a separate temporary credential with those exact scopes and run `node scripts/probe-agent-access.mjs /path/to/private-token-file`. The probe creates fictional persisted fixtures. Finish by revoking the credential, verifying both entry points reject it, archiving the fictional claim through the Owner UI, and deleting the private file. A failed probe still records any created identities for cleanup. The first attempt in this session stopped before creating fixtures because the harness expected JSON; the corrected harness accepts MCP's valid SSE response as well.

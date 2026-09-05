# Evidence workflow

Implemented 2026-09-05. Presentation follows the subagent's [Paper design handoff](evidence-design.md). Illustrative design content is not application data. Job tailoring and downstream content staleness remain separate milestones.

## Owner workflow

The evidence bank supports manual claims, exact citations, immutable context revisions, review decisions with rationale, metadata, history, archive/restore, and explicit duplicate comparison/merge. Default search excludes archived claims. Search uses FTS5 over assertions, labels, tags, and notes, plus pinned context labels. Filters cover review state, lifecycle, and context; pages contain 50 claims.

The citation picker accepts a selection or an exact pasted quotation. Repeated passages require an explicit occurrence. Offsets use UTF-16 code units, start inclusive and end exclusive. Each citation pins both source and processing-result identity; the service verifies the stored extraction digest, literal quote, and exact offsets. Page/line locators and Owner-attestation labels come from that immutable source result. Reprocessing never redirects a saved citation.

Context kinds are Owner Profile, Employment, Project, Education, and Credential. Existing claim references keep their selected context revision when context data changes. One Owner Profile is enforced per Owner. Historical values remain available in the inspector.

Material edits create a new Draft evidence revision and leave earlier review decisions unchanged. Metadata-only edits retain the material revision and review state. A review requires rationale; Verified also requires at least one citation. Verification expresses an explicit human/authorized-agent decision, not automatic source entailment. Archival is independent of the review state.

The editor holds its observed aggregate revision through a save attempt. Conflicts retain local form values, show a comparison, and require explicit reload. Citation/context subviews preserve the claim form. Dismissing changed forms requires a discard decision. Mobile uses a focused inspector and full-screen forms.

## Agent interfaces

REST accepts Owner sessions or scoped Bearer credentials. Cookie mutations require same-origin requests. MCP requires a live named Agent Credential in the Authorization Bearer header and rejects a foreign Origin. Session revocation, credential expiry/revocation, and the sole verified Owner restriction are checked on every request. Agents cannot create Owner attestations or mutate resumes/templates.

| Endpoint | Scope | Behavior |
| --- | --- | --- |
| `GET /api/v1/evidence` | `evidence:read` | `query`, `status`, `contextId`, `offset`; `archived=false` (default), `true`, or `all` |
| `GET /api/v1/evidence/:id` | `evidence:read` | Current claim, immutable material history, decisions, pinned contexts, source identities, and activity |
| `GET /api/v1/contexts` | `evidence:read` | Latest 200 context records with exact current revision identities |
| `GET /api/v1/duplicates` | `evidence:read` | Up to 50 pending current-revision comparisons |
| `POST /api/v1/evidence` | Per command | Tagged `EvidenceCommand`; schema lives in `packages/contracts/src/evidence.ts` |
| `/mcp` | Per tool/command | Stateless Web Standard MCP; exact server package version 2.0.0 |

Commands `create`, `edit`, `metadata`, and `context` require `evidence:write`; `review` requires `evidence:verify`; `archive` requires `evidence:archive`; `merge` and `keep-separate` require `evidence:merge`. Every mutation carries an idempotency key. Existing-record changes carry the observed aggregate revision. Merge observes both claims. Review also identifies the material revision being reviewed.

MCP tools: `search_evidence`, `get_evidence`, `list_contexts`, `list_duplicates`, `evidence_command`, `list_sources`, `get_source`, `create_source`, `retry_source`, and `resume_source_upload`. Tool discovery reflects credential scopes; command scope is also checked at execution. The `evidence_command` tool wraps the tagged command under `command`. MCP obtains runtime validation and JSON Schema from the same Effect schemas. Tool results wrap data or Problem Details; errors never masquerade as successful writes. JSON and legacy stateless Streamable HTTP clients are supported; no token streaming is used.

## Persistence and operational bounds

D1 batches commit revision guards, aggregates, reference indexes, audit entries, and permanent idempotency outcomes together. A CHECK guard makes every dependent write roll back on an observed-revision mismatch. Exact retries return the original outcome even after subsequent edits. Immutable original/extraction objects are reused rather than copied during claim edits or merges.

Merges append a new Draft to the kept claim and archive the other claim in the same transaction. Both histories remain. Restoring the archived source clears the merge lifecycle pointer without changing the kept claim. Keep separate applies only to the compared material revisions.

Duplicate detection is a bounded word-overlap heuristic (Jaccard similarity at least 0.8), never an automatic merge. Commands compare against 500 recent active claims. Queue reads reconcile missing suggestions in that same recent window after concurrent creates, inserting at most 50 missing pairs per read. Decisions are not changed by this derived-index repair. This is not exhaustive semantic duplicate detection.

Claim limits: assertion 4,000 characters; 20 unique citations of at most 10,000 characters each; 10 linked contexts; 20 tags of 60 characters; notes/rationale 4,000 characters. Evidence REST request bodies are bounded to 1 MiB. The common MCP/source transport bounds actual request bytes to 15 MiB. Source and document limits are unchanged.

FTS5 is a derived index maintained by database triggers in migration 0004. D1 exports do not support virtual tables in full-database export. The backup implementation must export base tables and rebuild this index on isolated restore; do not drop the live search index to work around export restrictions. Backup and restore drills remain an MVP release gate.

## Validation

Nineteen Workers service tests pass, including the source/access/runtime baseline, exact repeated citations, context pinning/search, material versus metadata verification, concurrent commands, transactional rollback including FTS/reference writes, merge/restore, duplicate recovery, and MCP scope/validation/idempotency/revocation. Type checks and lint pass across all six packages; the staging production build passes.

Local browser acceptance covers claim creation with a second repeated occurrence (63–80, line 3), explicit verification, metadata retention, context creation with discard recovery, a new Draft material revision, historical Verified inspection, concurrent-tab rejection/comparison/reload, reviewed merge, and restoration of the source. Desktop light and mobile dark inspectors were compared with Paper; mobile light dialog checks prompted a full-screen/spacing correction. Hosted acceptance identities and deployment status are recorded in `deployment.json`.

# Reviewed wording assistance

Implemented 2026-09-05 from Paper's Phase 2 wording launch/review and Phase 3 inline assistance board 77 (`7M3-0`). See `template-ai-design.md` and `history-scoring-design.md` for the design contracts.

## Behavior and boundaries

The structured editor exposes Suggest wording for a saved Content placement only when its server-side profile is configured. A persistent Wording proposals queue remains available without the provider. Generation, retries, cancellation, proposal review, and manual editing are separate actions.

Each task captures one placement's complete wording and binding, its exact selected Evidence Revisions, each pinned revision's own last review decision, pinned context values, and the draft's immutable posting snapshot. It excludes sibling placements, the draft name, and the Requirement Map. A goal cannot authorize invented facts. Archived and older pinned support remain visibly qualified; generation and acceptance never verify evidence.

The `content-placement-v1` digest covers the target path, section/block type and base references, field, complete placement binding/override, and resolved Content data. Starting observes the saved draft revision. Acceptance recomputes that digest against the current draft, checks the bound snapshot and every captured claim/context aggregate revision, then commits against the currently observed draft revision. Unrelated name or sibling edits can survive. A concurrent write after observation aborts all dependent writes.

Acceptance applies a local wording/evidence/reason override to exactly one Content placement. Library revisions, other drafts, and checkpoints remain unchanged. The draft, reference indexes, proposal decision, audit entry, and permanent idempotency outcome commit in one D1 batch. The request includes the exact proposal digest and review revision. Rejection clears its payload in D1 and cached task details; permanent receipts/audit contain only identifiers, digests, decisions, and applied revision metadata.

## Runtime

- `OPENAI_WORDING_MODEL`: `gpt-5.4-mini-2026-03-17`; profile `river-wording-v1`.
- Limits: 160,000 UTF-16 input units, 12,000 output tokens, 60-second provider timeout, one 90-second generate/validate/persist Workflow step, no automatic generation retry, three explicit attempts per task.
- At most two active job-analysis/wording tasks together per Owner. Retry preserves exact input and profile; changed input or profile requires a new task.
- Shared OpenAI Responses adapter: strict Effect-derived JSON Schema, exact returned-model check, storage and streaming disabled, truncation disabled, no tools, no SDK retries. Provider errors do not expose private prompts/output.
- Semantic validation rejects unknown or repeated evidence references and posting passages with incorrect exact UTF-16 offsets. Meaning assessment remains an AI suggestion for human review.
- `WordingWorkflow` uses persisted Operation/dispatch identities. Cancellation and superseded attempts cannot publish a late proposal. Generated payloads never enter Workflow step results.
- Owner-only server functions use the shared Effect services. REST/MCP agent permissions do not expose wording mutation.
- Migration: `0011_fuzzy_sandman.sql`; Workflow: `river-staging-wording`.

## Checks

Six wording service tests cover scope exclusion, preserved unrelated edits, copy-on-write, command replay, competing acceptances, stale target/support/context, exact pinned decisions, rejection cleanup, authorization, output citations/references, cancellation, retry limits, strict SDK transport, and model mismatch. The shared job-analysis tests also pass. Across the suite, 56 tests passed initially and one backup test found its hardcoded latest migration name stale; the test now compares every captured migration against the actual installed migration list, and its four-test file passes. This gives 57 passing service tests across the unchanged passing files and corrected focused rerun. Workspace TypeScript, Biome, and the staging build pass.

Local browser checks used explicitly synthetic persisted proposals, not provider output or candidate facts:

- Draft `01a0705e-b911-77a7-9aff-b9c273ebf338`, original captured revision 3.
- A second tab renamed the draft at revision 4. Accepting proposal `01a070e2-bb24-72b8-b4dd-7afe3f7922fd` retained that name and applied only the target wording at revision 5. The real PDF preview advanced to revision 5.
- Proposal `01a070e2-bb24-785f-8b0b-ce6afcae8f0a` became stale. Acceptance was disabled with its cause. Rejection removed the generated payload from both visible review and D1 (`payload IS NULL`).
- Desktop 1280px light comparison and 621px dark stacked review were screenshot-inspected. The narrow dialog/document had matching 621px widths without horizontal overflow. Narrow review does not expose composition mutation controls.

The Workflow and Owner-approved `OPENAI_API_KEY` are installed on staging. Manual composition remains available. This milestone does not establish MVP or V1 release readiness.

## Phase 3 inline assistance

Launch appears inside the selected placement. Generation and full proposal review occupy the editor's right pane. The existing PDF viewer remains mounted while review is open, preserving its page and zoom. The persistent queue still opens historical records independently. Explicit launch/review moves keyboard focus to its labeled heading; Keep editing returns to composition without cancelling a saved task.

Acceptance serializes with autosave. The browser acknowledges the fresh saved draft and constructs an undo step only while the exact accepted target is still present. Undo restores that placement's prior binding and keeps unrelated current edits. If the server contains unrelated edits, older full-draft undo snapshots are cleared to avoid erasing them. A concurrent local edit during acceptance enters the existing compare/reload/new-branch recovery flow. Session history is not durable across reloads.

Undo and redo are ordinary saved edits. They do not erase the accepted proposal or change its recorded applied revision. A changed or missing target exposes Compare target and prevents applying the stale proposal; exact support and revision checks also remain atomic on the server.

Two added service tests cover persisted undo/redo with an unrelated name change, unchanged acceptance history, and refusal to reconstruct undo after target changes/removal. All 14 focused wording/composition tests, six workspace type/lint checks and the staging build pass.

Local configured browser journey on 2026-09-05:

- Draft `01a0705e-b911-77a7-9aff-b9c273ebf338`; request captured revision 6, then an unrelated name edit saved revision 7 while generation ran.
- Real task `01a0730d-19d3-71b8-a26f-5d804e04a8a2`, model `gpt-5.4-mini-2026-03-17`, one attempt. Exact synthetic posting, selected Draft/unsupported evidence and full input were inspected.
- Proposal `01a0730d-2679-7ae1-a52a-7dd4e0139240`, digest `96ef62a531f690bd23e2a478aad0c53c9f955f841637d2a79842dfb7c37f69d2`, retained the wording and evidence references, changing the rationale. Its claim of a clearer rephrase did not correspond to a wording change; this is not evidence of model authoring quality.
- Acceptance saved revision 8. Undo saved revision 9 and redo saved revision 10. The unrelated name remained; the persisted proposal still records Accepted at revision 8.
- Actual PDF operation `01a0730e-2c7c-78e1-860e-1953cbb30d17` reached revision 10. Its 75% zoom survived inline review. The saved review queue retained the accepted record.
- Desktop 1280px light inline review and dark inline launch/stale comparison were screenshot-inspected. An existing synthetic stale proposal displayed original/current wording and disabled acceptance.

Hosted inline generation/acceptance and narrow-screen review remain unverified for this milestone. Synthetic fixture data does not establish candidate qualifications or the real Owner tailoring release gate.

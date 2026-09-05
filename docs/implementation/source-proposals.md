# Reviewed source proposals and clarification

Updated 2026-09-05. Phase 2 source-to-claim review is implemented. The Owner-approved staging provider key is installed; live generation remains unverified. Browser candidates below are explicitly synthetic, not provider output or Owner facts.

## Input and execution

The Owner selects one current Ready extraction, zero to ten current context revisions, and an optional 2,000-character focus. The server reads the complete private extraction, verifies its stored SHA-256, and captures exact source/processing identities, parser/version, UTF-16 locators, context values, and context aggregate revisions. A shared capture function supplies both preflight and execution. The preflight displays the actual serialized input length; more than 160,000 UTF-16 units blocks generation without truncation or hidden splitting.

The `river-source-claims-v1` profile pins `gpt-5.4-mini-2026-03-17`, a 60-second provider deadline, and 12,000 output tokens. It uses the common strict Responses adapter with no tools, streaming, provider storage, implicit context, or SDK retry. A persisted Operation and dispatch precede the `SourceAiWorkflow`. At most two job, wording, and source AI operations may be active together. Each task permits three explicit attempts using the same captured profile/input. Cancelled and obsolete results cannot publish.

The output contains at most twenty independent candidates. Each has an assertion, at least one exact citation, selected-context references, metadata, explanation, and up to five distinct clarification questions. All candidates validate before publication. Quotes must match the exact UTF-16 occurrence in the captured processing result; parser locators and attestation labels are derived by River. Zero candidates is a valid completed result. Malformed output is a failed operation.

## Review and retention

Each candidate has its own immutable digest/payload and Pending/Accepted/Rejected state. The task stores original input and execution metadata, not a raw generated batch. Workflow step results contain no generated content. Rejecting one candidate removes its payload, including assertion, quotes, notes and questions, while preserving sibling candidates and minimal decision metadata.

Acceptance requires the exact candidate revision/digest, current Ready source/processing selection, and every context supplied to generation. It creates a Draft Claim through the shared evidence creation plan. Claim, material revision, reference indexes, duplicate suggestions, clarification questions, candidate decision, audit, and permanent idempotency result commit atomically. Acceptance never verifies evidence.

Manual editing uses the existing claim editor. Saving creates an independent manual Draft with origin candidate ID/digest in audit history. It leaves the original candidate Pending. REST/MCP evidence capabilities remain unchanged; agents cannot generate/review these proposals or impersonate the Owner's manual proposal transition.

Clarification questions become claim-linked records only when their candidate is accepted. Answers enter through immutable source or Owner-attestation intake. The Owner saves a new cited Evidence Revision, selects its answering source explicitly, and records the link using both question and claim revision checks. Recording an answer does not change the claim's verification state. Original questions, assertions, answering source, and answering revision remain inspectable.

## Interface

The dedicated Paper agent completed the source launch and individual review designs before implementation: boards 69, 80, and 81 in [River App UI](https://app.paper.design/file/01M1PCGGJYH2EC4YRJNZSPRDZK/3-0). The Sources inspector now offers manual claim entry, configured generation, and persisted source proposals. The queue groups actual runs and displays real review counts, complete candidates, context snapshots, exact quotations, old/current input comparison, cancellation/retry, rejection, and links to resulting claims. Historical or unready extraction cannot launch new generation. Saved review remains available without a provider.

## Verification

- Seven source service tests cover exact citation resolution, individual acceptance/replay, rejected-content removal, stale source/context rollback, independent manual origin, source-backed clarification, whole-batch validation, empty results, cancellation/retry bounds, cross-owner denial, concurrent acceptance, preflight limits, and stored-extraction integrity.
- All **64 Workers service tests** passed in one complete run. All six workspace type checks and lint passed; the staging build passed.
- Local browser intake produced a real extracted source. Synthetic proposals were then inserted only into the local fixture database. Review accepted one candidate, rejected a sibling, created an independent manual Draft from another, and preserved two Pending candidates. Reprocessing the source disabled their acceptance. The clarification flow added a real source, cited it in a new Draft revision, and recorded the explicit answer without verification.
- Desktop review was inspected at 1280px. Source queue and clarification review were inspected at 621px in dark appearance with document width equal to viewport width. Live generation and configured launch remain separate credential-dependent checks.

Reproduce service checks with `pnpm --filter @river/web exec vitest run test/source-ai.test.ts`; the complete service suite uses `pnpm --filter @river/web test`. Apply migrations with `pnpm db:migrate:local`. Staging uses migration `0012_fast_shadowcat.sql` and workflow `river-staging-source-claims` in the personal Cloudflare account.

Local fixture identities:

| Record | Identity |
| --- | --- |
| Original source | `01a07100-703f-77e7-bb35-f537679683aa` |
| Captured processing result | `01a07100-703f-73a4-8f91-7f1af1c99cb7` |
| Synthetic source task | `01a07101-8061-7d31-a648-6ae8ff39c471` |
| Accepted Draft Claim | `01a07102-89dc-75bc-8a44-bb6dfaa2e082` |
| Independent manual Draft | `01a07103-aaea-7c07-9eee-eadfdcbcb5b2` |
| Clarification question | `01a07102-89de-742d-b62b-2baecaa716ab` |
| Answering source | `01a07104-4bb5-7617-b9e2-01558f6d17ff` |
| Answering Evidence Revision | `01a07105-3635-7481-97a6-379428775f43` |

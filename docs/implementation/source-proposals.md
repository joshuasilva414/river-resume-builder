# Reviewed source proposals and clarification

Updated 2026-09-05. Phase 2 source-to-claim review is implemented. The Owner-approved staging provider key is installed. Live hosted generation, individual Draft creation, rejection and source-backed clarification now pass using explicitly fictional sources. The earlier local fixtures below were synthetic responses; neither set establishes Owner facts.

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
- Desktop review was inspected at 1280px. Source queue and clarification review were inspected at 621px in dark appearance with document width equal to viewport width. The hosted configured launch, live generation and clarification answer were subsequently exercised below.

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

## Hosted provider journey

On web version `22be781c-a417-46da-af6a-9b743c0e6d2a`, source `01a07316-636d-74af-9a45-c12ffa42e177` was entered through normal pasted-text intake. It explicitly describes an invented Sample Candidate rather than the Owner and includes Unicode and repeated text. Its current processing result is `01a07316-636d-7ab3-8225-3212349a5571` (`utf8` version 1).

Launch displayed the complete extraction, zero selected contexts and 1,243 serialized UTF-16 units. First-attempt task `01a07317-38b0-7cb7-a328-59ec1692a4fb`, profile `river-source-claims-v1` / `gpt-5.4-mini-2026-03-17`, produced two complete cited candidates. Captured input SHA-256: `eaf0bc99626dba32f241c61d8d60e37a8bf72a839aeb1f8d060e5ce8703830e3`.

- Candidate `01a07317-5032-7517-99e8-c6fa45455118` quotes line 2 at exact UTF-16 offsets 78–195. Full assertion, highlighted occurrence, rationale and metadata were inspected before creating Draft Claim `01a07317-e671-7eea-98f2-a7b92c5be987`, Evidence Revision `01a07317-e671-76e3-b49e-b2016301d8c6`. The claim remains Draft and explicitly fictional; no verification decision was submitted.
- Candidate `01a07317-5032-7227-bcfe-6bfef082f6ed` quotes line 3 at offsets 196–300. It was rejected individually. The review removed assertion/quotes/metadata, and a read-only D1 query confirmed `payload IS NULL`, state Rejected and no created Claim/Evidence Revision. The accepted sibling remained intact.
- Neither candidate proposed a clarification question. This run does not verify live clarification authoring or repeated-occurrence selection by the provider.

The accepted fictional Draft was subsequently used for reviewed job ranking and duplicate-comparison QA, then archived through the normal claim command. Default active evidence search excludes it. Its source, exact material revision, accepted candidate and comparison history remain retained. No verification decision was submitted.

## Hosted clarification journey

Web version `6713b49e-c25b-428f-a27a-2059f83bee44` completed a second live source run with intentionally incomplete fictional attribution. Both source records explicitly state that Sample Candidate and Project Lantern are invented and do not describe the Owner. No candidate qualifications were inferred.

The launch captured 1,351 UTF-16 units, zero contexts and input SHA-256 `2c19171c7d3577790951ed4a2e84aa601f992328643fde30267e967ec5d77db2`. Profile `river-source-claims-v1` / `gpt-5.4-mini-2026-03-17` succeeded on attempt one of three.

- The contribution candidate quoted line 2 at offsets 102–187 and asked what the fictional candidate contributed. Individual acceptance created one Draft and preserved this question against its original Evidence Revision.
- The team-metric candidate quoted line 3 at offsets 188–300 and asked about measurement period, baseline and counting method. Individual rejection removed its payload, including all three questions, while preserving its digest and decision. A read-only D1 query confirmed the payload is null and no claim was created.
- The question's answer control was disabled before a new cited revision. Supporting-source intake retained a fictional contribution answer. Editing the claim added its exact line-2 passage at offsets 102–230 while preserving the original citation. Saving created a second immutable Evidence Revision and left the claim Draft.
- The answer control remained disabled until the answering source was explicitly selected. Recording the answer and reloading preserved its original question/assertion, answering source and answering revision. Both revision inspection controls showed the correct assertion and citations.
- Archival removed the fictional claim from default active search. D1 confirmed two material revisions, an answered question, Draft state and zero verification decisions. The aggregate reached revision 2 through the material edit and archival; answering the question updated its own revision.

| Record | Identity |
| --- | --- |
| Original source | `01a0737c-bbae-718a-a6b4-d1795b544ab4` |
| Captured extraction | `01a0737c-bbae-718b-9d95-8740c3f15849` |
| Source task | `01a0737d-80ba-7d2e-a1f7-cbb13b91d707` |
| Generation Operation | `01a0737d-80ba-7ad3-988d-3c073fcd6a14` |
| Accepted candidate | `01a0737d-a1ae-7e26-9208-0e1a8b8a6ed9` |
| Rejected candidate | `01a0737d-a1ae-71c3-b87e-faf8a8ce11b1` |
| Archived Draft Claim | `01a0737e-72df-703c-99f2-bf8f7d3af898` |
| Original Evidence Revision | `01a0737e-72df-7c8c-8cd0-fe8918b259b4` |
| Clarification question | `01a0737e-72fe-745e-a9da-628e5e6f544a` |
| Answering source | `01a07383-97ea-7ca3-a6f1-47769d38a06a` |
| Answering extraction | `01a07383-97ea-7ffb-896a-053e17c12843` |
| Answering Evidence Revision | `01a07384-83ab-7601-88d6-890c3913f917` |

This is a hosted provider and persistence check of the existing implementation. No application code changed and no service tests were rerun for this documentation update. The latest complete Workers suite remains the 141-test upload-recovery run.

A subsequent 72-table/88-object isolated restore preserved the answered question, both Evidence Revisions, exact answering citation, archived Draft state and rejected payload removal. Seven citations and the exported checkpoint passed full artifact verification. See `recovery.md` for the immutable snapshot and report identities.

# Reviewed duplicate comparison

The Owner can request one bounded advisory comparison for a current Pending duplicate pair. The existing manual Keep separate and merge commands remain usable when AI is unavailable. Paper boards 82–83 define the launch, captured/current inspection, independent acknowledgment, optional disposition attribution, and saved-history states. No new page or Agent Credential capability was added.

## Captured input and execution

`river-duplicate-comparison-v1` pins `gpt-5.4-mini-2026-03-17`, a 160,000 UTF-16-unit complete input limit, 8,000 output tokens, and a 60-second provider deadline. Preflight returns the actual full captured input and its canonical serialized size. Generation never truncates it.

The bundle includes both stable Claim identities, aggregate and immutable Evidence revisions, complete assertions and exact citations, pinned context values, current review decisions/rationales, and separate current source/context observations. Repeated passages retain their original offsets and Processing Result identities. Private claim metadata, jobs, résumés, and unrelated evidence are excluded.

The shared server Responses adapter uses strict schema output, `store: false`, no tools, no token streaming, and no SDK retries. Shared capacity permits two active AI operations across job analysis, wording, source proposals, and duplicate comparison. A typed operation map makes new AI operation types require an explicit capacity entry.

A permanent command records the task, Operation, dispatch, audit entry, and receipt atomically. The Workflow uses the stable dispatch identity and persists at most one complete comparison. Cancelled or obsolete attempts cannot publish; valid persisted output is recovered without regeneration. Failed/cancelled work permits up to three total attempts with the same profile and inputs. Provider errors are redacted. Workflow step results, audit entries, and receipts do not contain generated explanations.

## Review and disposition

A valid comparison contains all three Shared, Different, and Uncertain groups. Findings identify their assertion, citation, or context scope. Empty groups are allowed, but at least one nonblank finding is required. The qualitative assessment is advisory and never becomes an evidence fact or verification decision.

`Mark reviewed` acknowledges the exact proposal revision and digest while all captured dependencies and the Pending pair remain current. It changes only proposal state and audit/idempotency history. It does not merge claims or resolve the pair. A stale Pending result permits inspection and rejection only.

After acknowledgment, an initially unchecked control can attach the exact comparison identity/digest to a separate manual Keep separate or merge command. The same atomic transaction validates the comparison, pair membership, claim/review/context/source dependencies, and ordinary manual revision guards. A failed attributed command saves nothing. The browser never silently removes attribution and retries. The Owner can explicitly choose an ordinary manual decision instead.

Rejection removes the live generated payload, including any cached detail query copy. Minimal identity, digest, decision, and timestamp remain. Original evidence and captured input are preserved; backup copies follow normal retention.

Saved access is available through either Claim’s History tab after Keep separate, merge, archival, or later material changes. The current pair outcome is derived from the pair and both Claims; an old Pending flag is not presented as an actionable pair after merge or supersession. Saved disposition records show the actual rationale, actor, and time. Earlier captured input never changes when current provenance is inspected.

## Verification

Six focused Workers tests pass. They exercise independent acknowledgment, idempotent replay, exact repeated-quote occurrences, private-metadata exclusion, explicit separate/merge attribution, stale rollback without a fallback mutation, both-claim history, rejection payload removal, Owner authorization, shared capacity, cancellation, retry identity, strict provider output, and concurrent review. The full 70-test Workers suite, workspace type checks, lint, and staging build pass.

Local browser review used clearly labeled synthetic explanations inserted only into the local database; these are not provider responses or Owner qualifications. The browser inspected captured/current provenance, acknowledged one result without changing either claim, explicitly linked it to Keep separate, reopened the result through both claim histories, and rejected another result after the pair became stale. At 1280px light and 621px dark, the review remained readable and the latter had no horizontal document overflow. An actual 390px viewport remains unverified.

Fixture pair: `01a0700c-a0f8-7027-8a75-4850d065b6a8`. Reviewed task: `01a07122-f441-7d87-87f9-52fa20a2621c`; proposal: `01a07122-f441-755b-bc02-f93ccfe72c55`. Rejected task: `01a07122-f441-7eb5-b4d7-93f43ded2001`. The remaining Pending task is historical after the explicit pair decision. Fixture identities are also in `test-results/duplicate-ai-browser-fixture.json`.

Migration `0013_new_sue_storm.sql` adds the task and proposal tables. The configured Workflow is `river-staging-duplicate-comparison`. The Owner-approved staging key is installed. Current hosted version and acceptance status are recorded in `deployment.json`.

## Hosted provider journey

On web version `6c544922-2ada-4cdd-ad38-77c0574e812e`, fictional Claims `01a07317-e671-7eea-98f2-a7b92c5be987` and `01a0732d-7f64-7b83-9fcd-f62c1473540b` produced Pending pair `01a0732e-8229-7690-806b-ced2cb2e7439`. Both explicitly describe an invented Sample Candidate and cite the same source's line 2 at UTF-16 offsets 78–195. A manual wording revision crossed the existing 0.8 similarity threshold; the threshold was unchanged.

Launch displayed 1,687 serialized UTF-16 units and zero contexts. Task `01a0732f-f444-7563-994f-09bcdcb6b840` succeeded on its first attempt using `river-duplicate-comparison-v1` / `gpt-5.4-mini-2026-03-17`. Comparison `01a07330-0ea1-7825-8f80-ef5c33143680` has digest `b5c4ce4ee5af0adbc2b7f9cb581cc785397aa5603c5fa92ad53d3f78446be7bf` and Operation `01a0732f-f444-7aae-a3b2-d53d0638f0f6`.

Full findings, captured inputs, current assertions and exact citation provenance were inspected. The model assessed Same fact. Its Shared finding incorrectly said the first assertion differed from its quote, while Different correctly said they matched. This advisory inconsistency remains visible in the retained payload; review does not endorse every generated explanation.

`Mark reviewed` changed only comparison review state: the pair stayed Pending and both Draft Claims kept their material revisions. The separately selected attribution control linked the comparison to a manual Keep separate decision. Its rationale states that the claims describe the same fictional fact, are retained separately for workflow QA, and will be archived; it also records the model inconsistency. Both Claim histories reopened the same reviewed comparison, saved rationale, actor and timestamp. The resolved pair was Separate, with no new disposition action.

Both fixtures were archived through normal claim commands after this check. Default active search is empty; archived evidence and the selected job association retain their exact provenance. No merge or verification decision was submitted. Hosted stale-race and rejection paths were not rerun; their focused service and earlier local checks remain the evidence for those paths.

# Reviewed job analysis

Updated 2026-09-05. The Paper subagent designed `6DH-0`–`6DM-0` before implementation; see [the design handoff](job-ai-design.md).

## Execution and review

The Owner can request a complete Requirement Map proposal or a ranking for all requirements or one requirement. A task captures the exact Job Target revision, current display details, immutable posting snapshot, workspace revision, and full map. Ranking captures at most 30 active FTS matches, including exact Claim/Evidence Revision pairs, material, review decision, and pinned context values. Retrieval uses up to 12 normalized keyword terms, falling back to the role when keywords are absent. The bound and actual search are visible in review. No match remains an explicit gap; retrieval never implies whole-bank coverage.

Task, Operation, dispatch, audit, and idempotency outcome persist atomically. Dispatch uses the Operation ID as the stable Workflow identity. `JobAiWorkflow` makes one bounded OpenAI Responses request with strict schema output, `store: false`, no tools, disabled truncation, no streaming, and no SDK retries. Effect wraps provider execution. The response model must exactly match the captured profile. Schema and semantic validation reject unknown references, duplicate associations, missing coverage, and quotes that differ from the exact UTF-16 offsets. Validation never repairs generated citations or infers requirement identity correspondence.

Contract `river-job-analysis-v2` captures indexed posting passages for requirement extraction before dispatch. Every nonempty line occurrence receives a stable index, snapshot ID, exact quote, and UTF-16 offsets. Lines longer than 4,000 units use successive bounded spans without splitting a surrogate pair. The model returns one to five distinct passage indexes per requirement; River resolves only those selected indexes against the captured input and rechecks each quote against the immutable posting. Unknown or repeated indexes fail. The original posting and complete index both count toward the existing serialized input budget; neither is truncated. Review and accepted maps retain the same full passage contract as manual requirements.

Historical v1 inputs and proposals keep their offset-based interpretation. Changing the task contract requires a new capture; retries cannot silently adopt a different profile. Ranking keeps its exact evidence-reference output. New ranking tasks use `river-job-analysis-v3` and capture policy `substantive-support-with-gaps-v1`: partial matches require an explicit gap for that requirement before publication. The provider instructions reserve results for substantive overlap and put unsupported requirements only in gaps. This structural rule does not replace human review of relevance.

Validated output persists as one Pending proposal before the Operation succeeds. New requirement UUIDv7 identities are assigned at proposal persistence and retained at acceptance. Generated output is not a Workflow step result. Rejection clears the sole generated payload in D1, clears browser detail caches, and keeps only minimal decision metadata in permanent receipts and audit. Input snapshots and accepted domain history remain. Backup copies expire through retention.

Whole-map acceptance uses D1 batch guards for the exact job, posting, workspace, candidate aggregate revisions, and context aggregate revisions. A failed guard prevents the proposal decision, map, association changes, reference indexes, audit, and receipt from committing. Removing requirement identities requires acknowledgment of their exact evidence associations. General selections and retained-identity associations survive; historical workspace revisions remain unchanged.

Ranking acceptance records review only. The Owner then opens the existing evidence provenance inspector and explicitly chooses an exact revision for a current association. Older evidence is compared explicitly; no newer revision is selected implicitly. Choosing uses the shared manual selection command and its current Job Target revision guard. Current Draft, verification, archive, and citation information remains visible. A general selection does not close a requirement-specific selection gap.

## Configuration and bounds

- Server secret: `OPENAI_API_KEY`. Never place the key in D1, browser state, or source control.
- Task settings: `OPENAI_REQUIREMENTS_MODEL` and `OPENAI_RANKING_MODEL`, currently pinned to `gpt-5.4-mini-2026-03-17` in Wrangler. The Owner-approved staging key is installed. Hosted extraction passed with v2; ranking quality checks are described below.
- Prompt/schema contracts: `river-job-analysis-v2` for requirement extraction and `river-job-analysis-v3` for ranking; retained v1/v2 history remains readable. OpenAI SDK `7.10.0`.
- Maximum serialized input: 160,000 UTF-16 units; provider output budget: 12,000 tokens; maximum stored proposal: 200,000 UTF-16 units.
- Maximum generated map: 30 requirements; ranking: 60 associations, 100 gap explanations, 30 candidates.
- Provider timeout: 60 seconds; Workflow generation/validation/persistence step: 90 seconds, no automatic retry. Two active AI tasks per Owner; three explicit attempts per task.
- Retry reuses the immutable input and exact profile. Changed profiles or inputs require a new task. Obsolete and cancelled attempts cannot publish a new result.
- Queue pages contain 50 tasks. The browser polls active execution every 1.5 seconds and shows actual persisted stages. No token percentage is fabricated.

Missing task configuration hides its generation action without interrupting manual tailoring. Saved proposals remain accessible without a provider. Failures expose a safe message and bounded retry when available; raw provider output, private input, API keys, and signed URLs are excluded from errors. There is no recoverable-result save action because generated output has no separate durable copy before proposal persistence.

REST/MCP manual job capabilities remain unchanged. Only Owner server functions start, inspect, retry, or review AI work. External agents gain no resume or template mutation capability.

## Verification

The full Workers suite passed 47 tests. Eight AI-focused tests exercise competing acceptances, full-map removals and acknowledgment, permanent retry replay, changed profiles, exhausted attempts, cancelled/obsolete publication, changed evidence and context, rejected-payload removal, exact citations, provider schema/options, and Owner isolation. Workspace type checks, lint, and staging builds pass.

Local browser checks use clearly labeled, directly persisted synthetic review fixtures, not claimed provider output. They verified provider-free manual use, persistent queue, complete map comparison and acceptance, stale acceptance disabled, rejection content removal, accepted ranking with no selection change, exact citation inspection, and explicit selection persistence. Light desktop at 1280px and dark narrow review at 621px were inspected. Narrow content width remained 621px. An actual 390px application check remains open. Later hosted provider journeys are recorded below.

The local fixture job is `01a07025-a71f-7c44-8164-8b5fb450fbd8`. Accepted requirement proposal: `01a070b7-d06d-7575-a506-0716ac50a0d4`; rejected stale proposal: `01a070b7-d06d-7fce-b3f5-d0e6159e691c`; accepted ranking proposal: `01a070bb-3264-7bbe-9d00-8119ce24109a`. These are synthetic test records, not Owner qualifications.

### Requirement citation correction

Hosted fictional job `01a07317-0c52-7545-b111-8a05135624a8` produced two failed attempts on v1 task `01a07317-93ea-7bed-a1d1-1678c04c1dcb`. Its map stayed empty. A single isolated replay of that exact captured input returned HTTP 200 from the provider, then failed River's exact posting-offset check. This reproduces a concrete failure mechanism; the two hosted failures retained only their generic safe failure, so their individual causes were not recovered.

The v2 contract replaces model-calculated offsets with explicit selection of captured passage indexes. Repeating the same fictional provider input with that contract passed schema and citation validation. No diagnostic request wrote application records. Temporary diagnostic code was removed.

Two added service tests exercise second-occurrence selection through actual provider serialization, proposal persistence and map acceptance; invalid/duplicate/empty selections; Unicode passage boundaries; and full input-budget refusal before task writes. All 136 Workers tests across 24 files, workspace type/lint checks and the staging build passed for the citation fix.

Hosted v2 task `01a07325-8848-75f7-bfce-bb6b5bba3d11` then succeeded on its first attempt on web version `ad2c4046-65d3-424b-8aa4-365a28147626` (commit `d89a5b8`). Full review showed three requirements, two Required and one Preferred, with exact line 2/3/4 passages at offsets 55–135, 136–204 and 205–262. Proposal `01a07325-a527-771c-9b05-f66ed4fb7af5` was accepted into map `01a07326-0f2a-7ef4-bd96-ddf21a878558` at job revision 1. The two failed v1 attempts remain intact.

### Ranking quality correction

First-attempt v2 ranking task `01a07326-6ba9-78ab-afd3-4851a630db50` inspected one active fictional Draft Claim. It returned a direct accessibility match but also assigned Partial support to TypeScript and PostgreSQL without gap entries. Its own database explanation admitted there was no relevant evidence. The complete ranking was rejected; no evidence selection was made.

The v3 ranking policy now requires a gap alongside every partial requirement match, and its instructions exclude associations based only on generic software context. The focused service test first failed for the missing captured policy, then verified rejection before proposal persistence, acceptance of a result with its explicit gap, unchanged selections, and preserved legacy behavior. Ten focused job tests, workspace types/lint and the staging build pass. The full 136-test suite was not repeated for this narrower change.

Hosted v3 task `01a0732c-0d1a-7c10-aa4c-01d10e9e1cd2` succeeded on its first attempt on web version `6c544922-2ada-4cdd-ad38-77c0574e812e` (commit `c3bfc9d`). Proposal `01a0732c-26cb-787d-8e7f-3524dbb38c67` returned one accessibility match and explicit TypeScript and PostgreSQL gaps. Complete input, findings, the exact line-2 citation and Draft status were inspected. Accepting the ranking review left zero selections. The separate provenance action then chose Evidence Revision `01a07317-e671-76e3-b49e-b2016301d8c6` for the accessibility requirement, saving job revision 2. The other requirements remained explicit gaps.

The earlier v2 rejection required its separate confirmation action. A read-only D1 check confirmed proposal `01a07326-7e75-75d7-8677-ce1419dc0dd6` is Rejected with a null payload. No weak-match selection was saved. After completing duplicate QA, both fictional Claims and the fictional Job Target were archived through normal UI commands. The archived job retains all three requirements, its exact Draft/Archived selection, and both gaps. No Owner qualification was created or verified.

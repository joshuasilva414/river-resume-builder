# Phase 3 history, scoring, and inline assistance design handoff

Updated 2026-09-05. A dedicated Paper subagent designed these states before implementation. This task owns Paper and this document only. It inspected River and ATS Screener contracts read-only; it did not change or verify application code, run scoring, or modify an external workspace.

Authority: [SPEC.md](../../SPEC.md), [PLAN.md](../../PLAN.md), the existing [checkpoint/export handoff](export-design.md), and the [reviewed authoring handoff](template-ai-design.md). Presentation: [River App UI in Paper](https://app.paper.design/file/01M1PCGGJYH2EC4YRJNZSPRDZK/3-0). Preserve the current River logo, Newsreader, Instrument Sans, IBM Plex Mono, and semantic light/dark palettes. Read Paper JSX and computed styles for measurements.

## Design map

Existing references remain intact:

| Surface | Paper node | Reuse |
| --- | --- | --- |
| History and scores | `1W5-0` | Timeline `1YP-0`, score inspector `1YR-0`, chronological navigation and application shell |
| Checkpoint comparison | `3FR-0` | Selectors `3I1-0`, content comparison `3IK-0`, PDF navigation and restoration entry |
| Mobile history | `3P0-0` | Status bar `3P1-0`, mobile header `3PC-0`, chronology and navigation |
| M5 review/downloads | `5TM-0` through `5TT-0`, `6BF-0` | Immutable capture/artifact identities, report-specific acknowledgments, original export records and evidence-changed review |
| Reviewed wording | `6ZY-0`, `702-0` | Exact target/dependency checks, proposal review separate from execution, stale recovery and payload rejection |

The older comparison's `3JU-0`/`3JW-0` Reqcore label is not part of this ATS adapter. Do not implement it as a seventh platform. The older score card's evidence-selection assertion is also not a provider capability: ATS Screener receives text, not River's evidence selection state.

New focused state sheets:

| Board | Paper node | Exact implementation subtrees |
| --- | --- | --- |
| 70 · Checkpoint capture and chronological history | `7LW-0` | Capture `7M9-0`; optional label `7MG-0`; save `7MN-0`; save/conflict gate `7MQ-0` onward; captured/PDF preparing `7N0-0`; chronology `7N8-0`; current draft `7NG-0`; checkpoint rows `7NK-0`, `7NR-0`, `7O2-0`; pagination `7OC-0`; New branch `89W-0` |
| 71 · Restore as a branch and compare saved content | `7LX-0` | Comparison `7OL-0`; pinned selectors `7ON-0`; wording `7P3-0` onward; composition/reference changes `7PA-0`; restoration `7PK-0`; name `7PO-0`; create `7PW-0`; pending-editor protection `7PZ-0`; source regeneration `7Q7-0`; template eligibility `7QF-0`; current-draft branch `8A0-0` onward; unscored working-draft explanation `89S-0` |
| 72 · Current and historical PDF comparison | `7LY-0` | Selectors `7QM-0`; original PDF panel `7QS-0`, PDF `7R2-0`; current panel `7RR-0`, freshness `7RT-0`, PDF `7S0-0`; independent page controls `7QY-0`, `7RW-0`; missing-PDF state `7SQ-0` |
| 73 · Save and score · Six provider simulations | `7LZ-0` | Launch/preflight `7T5-0`; exact character counts `7TD-0`, `7TE-0`; submitted-input views `7TG-0`; score action `7TO-0`; stages `7TR-0`; six-platform result `7U3-0`; rows `7UB-0`, `7UE-0`, `7UH-0`, `7UK-0`, `7UN-0`, `7UQ-0` |
| 74 · Scoring identity, findings and compatible comparisons | `7M0-0` | Five-dimensional inspector `7X4-0`; finding `7XO-0`; decision/rationale `7XW-0`, `7Y0-0`; save decision `7Y5-0`; result selectors `7YC-0`; compatible delta `7YL-0`; identity `7YT-0`; context action `7YZ-0`; incompatible/missing identity `7Z2-0` onward |
| 75 · Scoring recovery and fixture designation / Dark | `7M1-0` | Recovery `7ZN-0`; outage retry `7ZU-0`; rate limit `7ZZ-0`; malformed response `807-0`; scoring-only size gate `80F-0`, counts `80I-0`/`80J-0`, export `80M-0`; cancellation `80S-0`; fixture review `80U-0`; incomplete rows `810-0`, `814-0`, `818-0`; designation withheld `81G-0`; successful designation `81O-0` onward |
| 76 · Mobile chronological history and restore review | `7M2-0` | Body `82G-0`; branch `82K-0`; selected checkpoint `82T-0`; review/download `836-0`; score `838-0`; compare/restore `83A-0`; earlier checkpoint `83F-0`; pagination `83M-0` |
| 77 · Inline wording assistance · Reviewed placement change | `7M3-0` | Editor/launch `85F-0`; selected target `85O-0`; instruction `860-0`; generate `867-0`; stages `86A-0`; manual/unavailable `86I-0`; proposal `86P-0`; full original/proposed `86S-0` onward; support `870-0`; apply `87E-0`; stale target `87H-0` onward |
| 78 · Mobile branch restoration confirmation | `81V-0` | Body `84G-0`; name `84M-0`; source-only consequence `84R-0`; excluded-change review `84V-0`; unchecked acknowledgment `84Z-0`; guarded Create branch `853-0`; Cancel `855-0` |
| 79 · Mobile checkpoint comparison · Scores unavailable | `87S-0` | Body `88D-0`; two selectors `88G-0`, `88K-0`; tabs `88O-0`; different-posting explanation `88V-0`; platform `88Y-0`; independent results `892-0`, `89B-0`; context `89K-0` |

These are state sheets, not ten new application routes. Alternative success/failure/stale states are not shown simultaneously in the product. Counts, names, dates, fixture labels, revisions, quotes, identities and scores are neutral illustrative data. They do not seed production or establish a canonical fixture list.

## Explicit checkpoints and chronology

- Reuse M5 capture. Capture the exact acknowledged draft revision and its complete immutable composition, local overrides, library graph, evidence/context/contact values, posting snapshot, template/renderer identities, and document input. No later save changes that checkpoint.
- Save checkpoint waits for serialized debounced saves to acknowledge the intended revision. Saving, failed autosave, and concurrent-tab conflict are distinct states. A conflict prevents dependent capture; it cannot silently capture the server's competing version.
- Once the capture transaction commits, show Checkpoint saved even while its document operation is preparing. Document failure does not erase the capture. Retries resolve the same command identity and checkpoint rather than duplicating the user's save.
- The optional label is capture-time metadata and needs a bounded optional field in the capture contract. It is not an editable checkpoint body. Labels are not required to identify a checkpoint; show the stable display identity and capture time. Do not derive a durable checkpoint number from a paginated array index.
- The working draft is a separate row with actual acknowledged revision and save state. It is never counted as a checkpoint. History is newest first with stable ordering and pagination; preserve loaded rows when the next page fails. Show Load earlier only when the server reports another page.
- Display actual draft/branch names, checkpoint revision, pinned pack revision and posting association. Use the existing draft name as the branch label; do not invent a Main branch title if no such field exists. Show branch-origin relationships when alternatives exist.
- History can filter the selected branch and expose its related alternatives. A selected checkpoint remains selected when new items arrive. A list refresh must not silently change the artifact or comparison being reviewed.
- Saved, document preparing/failed, reviewed, exported, and scored are independent states. Scored means an actual completed validated scoring result exists; failure is not a score of zero. Previously exported entries retain their original artifacts, report and acknowledgments.

## General branching and non-destructive restoration

New branch from the current editor first captures the acknowledged revision, then creates the named draft from that exact checkpoint. Restore from an older checkpoint opens the same branch-creation contract with that checkpoint as the base. Both preserve the original branch, newer work, and every historical artifact.

The new branch records its source checkpoint and source draft/lineage. Its starting composition copies the complete local content/composition overrides and exact child references; it must not rebind to current library revisions. Preserve the source's immutable posting association, including an earlier posting. Subsequent edits in either branch remain independent.

Branch creation is an Owner command with permanent idempotency, an exact source-checkpoint identity, a bounded new-draft name, and any explicitly reviewed compatible template choice. The new draft, relational indexes, lineage, audit entry and idempotency result commit together. It does not update or delete the source. If creating the branch after capture fails, retain the saved checkpoint and retry branch creation from that identity.

Before navigating away from an editor with unsaved local work, finish its save or keep it open. A failed save/conflict prevents a destructive switch. Do not promise persistent offline recovery that the editor does not implement. A newly created branch remains accessible if navigation itself fails.

For a checkpoint with an accepted source override, reuse Phase 2's explicit regeneration review. Returning to structured editing creates a branch from the retained structured base and regenerates LaTeX. List every source-only change excluded from the new draft. The original refined checkpoint/source/PDF remain preserved. The acknowledgment starts unchecked, and Create branch is disabled until it and all source/template guards pass.

A retired/incompatible pinned template is still valid for historical inspection. If it is ineligible for new structured work, require an explicit compatible choice and full comparison. Never move to the latest revision silently. Neither restoration nor a saved checkpoint marks current evidence verified or transfers old export acknowledgments to a new checkpoint.

## Content and PDF comparison

- Select two exact checkpoints, or one checkpoint and an acknowledged working-draft revision for content/PDF review. Pin both comparison inputs. A later draft save shows that newer work exists and offers explicit refresh; it does not replace the reviewed comparison.
- Compare complete wording, insertions, removals, order, content/block/section identities, local overrides, exact evidence bindings, saved contact/context fields, posting association, template graph and supported style changes. Provide full values, unchanged context and stable locators. A compact summary is navigation into the complete comparison, not permission to omit fields.
- Use the actual saved field values even when today's context/profile differs. Library changes appear as reference/content changes; checkpoint inspection does not resolve historical references to latest.
- PDF panes name the checkpoint or draft revision, artifact identity, page and freshness. Each has independent page navigation and zoom. Do not assume equal page counts or require synchronized scrolling.
- For current work, keep the last successful PDF with its actual revision while a new one is queued/running/failed. A stale PDF is never labeled current. Obsolete completions cannot replace a newer preview. A missing historical PDF has no substitute: prepare/retry that exact captured document input, or compare saved content while it is unavailable.
- The original `.tex`, extracted text, local validation report and protected PDF downloads stay reachable through M5 review. Comparing or scoring does not replace them.
- Score comparisons require completed scoring records for two saved checkpoints. A working draft has no scoring identity; disable the Scores view for that input and explain Save checkpoint & score. Do not assign a nearby checkpoint's score to current edits.

## Actual ATS adapter contract inspected

Read-only source: `/Users/joshuasilva/Dev/ats-screener/src/routes/api/analyze/+server.ts`, `providers.ts`, `cache.ts`, `rate-limiter.ts`, `/api/version/+server.ts`, `src/lib/engine/llm/prompts.ts`, and `src/lib/engine/scorer/types.ts`. The API's full-score prompt, not the separate local rule-engine profile list or documentation examples, determines the returned simulation shape.

| Contract | Design/adapter requirement |
| --- | --- |
| Request | `POST /api/analyze`, JSON mode `full-score`, complete checkpoint `resumeText`, complete immutable snapshot `jobDescription`; no PDF binary |
| Six results | Workday, Taleo, iCIMS, Greenhouse, Lever, SuccessFactors, displayed in that order |
| Per-platform values | System/vendor, overall score, returned `passesFilter`, five-dimensional breakdown, full suggestions |
| Five dimensions | Formatting; Keyword match; Sections; Experience; Education |
| Supporting detail | Formatting issues/details; matched/missing/synonym keywords; present/missing sections; quantified/total bullets, action-verb count and experience highlights; education notes |
| Suggestions | Accept the documented legacy string and structured object variants; preserve full summary/details, impact and affected platforms when supplied |
| Success metadata | Preserve raw `_provider`, `_fallback`, `_cached` plus the new scoring identity and raw result |
| Failure | 400 invalid input; 429 rate limit with Retry-After; 503 no provider/all providers failed; transport/timeout and malformed response remain explicit failed runs |

Quantification is part of Experience's returned detail. Do not invent a sixth dimension or an overall average. Display the provider's `passesFilter` outcome rather than recomputing a universal threshold. A pass count is the count of true outcomes among exactly six validated results, not a combined score.

The current route validates only that generated JSON is an object. River must validate the complete returned shape before presenting a successful run: exactly the six required unique systems, valid bounded scores, boolean filter outcomes, well-typed details/counts, and allowed metadata. Missing/duplicate/unknown platforms or invalid dimensions produce a malformed-result failure. Never fill absent results with zero or label a partial response complete.

`_fallback: false` in current successful responses is not proof that no backup provider was attempted. The actual provider chain may select a later provider. Store the raw metadata; do not invent routing history from that flag. The separate `/api/version` observation is diagnostic deployment context, not proof of the identity of a cached score.

## Scoring preflight and identity decision

The parent implementation agent confirmed this gate during design: **block scoring when exact extracted résumé text exceeds 6,000 JavaScript string units or the immutable posting exceeds 4,000**. Show actual counts and the corresponding limits. These are this adapter version's effective analysis limits, not universal résumé length rules.

The current route accepts larger requests (50,000/20,000), but its prompt silently slices to 6,000/4,000. River must prevent that truncation. Count with the adapter's actual string-length convention, including surrogate pairs; the UI may say characters, while the capability contract records the convention. Do not remove content, shorten a posting, omit the job, or submit excerpts automatically. Empty text and missing required inputs also prevent scoring. Export and normal document review remain available, subject to their existing gates.

The authorized ATS change remains narrow and backward compatible: attach trustworthy server-created rubric, actual winning model/provider, and deployment identity to each result; preserve that identity through cached results and include scoring identity in cache invalidation. Effective input-limit metadata may be included as versioned adapter capabilities without changing scoring behavior. River does not need to modify the provider's scoring rubric, chain, thresholds or prompt behavior for this milestone.

Scoring identity must come with the actual result. Do not infer it from a display label, request-time provider preference, a separate version fetch, or the service's currently deployed model. Suggested adapter-facing fields are identity-schema version, provider/model identity, rubric identity, deployment identity, capability version/limits and input coverage. Exact serialized names are implementation choices; these facts and their provenance are required.

Compatibility is conservative: both results have complete trustworthy identities, the same immutable job snapshot, matching provider/model/rubric and compatible deployment/capability identities, and complete validated inputs. Default to exact identity equality unless a versioned, trusted compatibility policy explicitly establishes equivalence. Record the comparison policy version. A matching job title or equal job text is not the same snapshot identity.

If identity is missing, inputs are incomplete, identity differs, or the job snapshot differs, show the specific reason and suppress deltas/trend claims. Independent raw results remain viewable. Do not normalize scores across models, providers or rubrics. A new scoring run keeps the original result; scoring both checkpoints again is not a promise that both will receive compatible identities.

## Save & score, runs, and finding decisions

Save & score orchestrates exact capture, validated document text readiness, adapter-capability preflight, and a durable scoring operation. Capture failure stops submission. A scoring failure preserves the checkpoint and leaves review/export usable. A scoring success does not acknowledge evidence issues or authorize export.

Required service records and commands:

| Boundary | Required data and behavior |
| --- | --- |
| Start checkpoint scoring | Owner, permanent command identity, exact checkpoint/artifact/text digest, immutable job snapshot/digest, adapter/capability identity, exact input lengths and submission fingerprint |
| Scoring Operation | Persist Operation and dispatch before execution; stable dispatch identity, bounded attempts/time, actual stage, cancellation request, safe failure code and Retry-After when supplied |
| Scoring result | Immutable run/result identity, submission fingerprint, exact submitted text/job references, actual returned scoring identity, observed `/api/version`, raw six-platform response, provider/cache/fallback metadata, request/completion times |
| Inspect/list results | Return run chronology and complete findings; identify the selected run and last successful run explicitly; failure never overwrites an earlier success |
| Compare results | Exact two result identities, checkpoint/job identities, complete compatibility result/reasons and comparison-policy version; deltas only when compatible |
| Review finding | Owner, expected decision revision, exact result/finding identity or digest, outcome, rationale and command identity; review, audit and idempotency commit atomically |
| Retry/cancel | Guard current operation state and retry budget; retry saved-result finalization without repeating provider work when possible; new input or explicit rescore gets a new run identity |

Do not stream model tokens or fabricate percentages. Stages are preparing text, waiting for provider, validating response and saving result. All six simulations arrive together from this endpoint; no invented per-platform execution progress. Cancel requested is distinct from terminal Cancelled, and an already dispatched remote request may finish. A late response must follow the documented operation-state guard rather than becoming an unsolicited applied change.

Retry rate-limit responses only when the actual Retry-After permits and within the configured budget. Do not hardcode the public service's documented rate limits as a guaranteed quota. For outages, transport errors and malformed responses, retain failure diagnostics and offer bounded retry. Budget exhausted is a visible terminal failure with diagnostics; export remains available. A valid result that cannot finalize in storage stays in saving/recovery state, not a fabricated provider failure.

Findings can be Addressed, Accepted, or Not applicable. These are Owner review decisions, not changed provider outputs. Preserve the full finding, rationale, actor/time and exact result identity. Unreviewed is the initial state. Addressed must be explicit; editing wording, accepting a proposal, or scoring a newer checkpoint does not automatically mark an older finding addressed. New runs do not silently inherit finding decisions, even when a similar suggestion reappears.

Scoring suggestions do not establish factual support, know River's evidence selection, inspect PDF visuals, or reproduce a vendor's real screening. Keep local document validation in its own report. Open wording review links to the relevant placement when one can be identified; a provider's prose cannot directly mutate a resume or verify a Claim.

## Canonical fixture scoring and designation

The `ATS Screener tested` designation is separate from local ATS-safe/document validation and template lifecycle approval. Its report pins the exact template/component graph, synthetic fixture-set version and all required fixture IDs, exact extracted fixture text and synthetic job inputs, renderer/validator identities, scoring runs/identities and date.

River currently has `packages/templates/src/fixtures.ts` with an all-types synthetic rendering fixture, but no separately defined canonical ATS-scoring manifest was found during this read. The parent implementation agent confirmed a separate versioned scoring manifest with exact synthetic resume/job inputs, the template graph and every required fixture ID. The three pictured fixture labels remain examples until that manifest is implemented. Negative document-validation fixtures are not scoring fixtures.

- Every required canonical fixture must have valid local output and complete six-platform scoring under the qualification policy. Every returned `passesFilter` must be true. Missing, failed, malformed, below-threshold, incompatible or oversized required fixtures withhold the designation.
- Apply the same full-input preflight. Never skip or truncate a required fixture to award the badge. Failure is a report to review, not permission to lower the threshold or rewrite a provider outcome.
- Show individual fixture/platform outcomes and full findings. Retry failed work within its budget; preserve all earlier run results. If identity or fixture inputs change, rerun the necessary complete qualification set rather than combining incompatible runs into one pass.
- A new template revision or required fixture-set version needs new qualification. An old badge remains a dated historical assertion about its exact report; it does not qualify a newer pack revision. Refinement creates a new Draft and passes the existing lifecycle review.
- A completed passing report is the only source of the designation. A template name, one successful sample, or visual approval cannot set it. Fixture generation/scoring remains synthetic-only and never loads Owner evidence or private resume source.

## Inline writing assistance

Board 77 moves the existing Phase 2 review beside a Content placement. It does not introduce autocomplete that silently accepts suggestions. Launch requires a configured server task profile and identifies the saved target. Pending proposals remain accessible when a provider/profile is unavailable; a requested run that fails shows bounded retry and manual wording remains available.

Reuse the exact bounded proposal contract: target placement and full local/base wording, selected Evidence/Context Revisions and relevant decisions, immutable posting, task profile and input-scope declaration. A stable versioned target fingerprint covers everything actually given to the model. The proposal shows full original/proposed wording, exact support/quote/provenance, meaning assessment and rationale.

Apply rereads the current draft, verifies the target fingerprint and all pinned dependencies, then commits a local Content Override with CAS against the current observed aggregate revision. Unrelated placement edits may preserve validity only because they were excluded from the AI input. A changed target, support, posting or supplied broader context requires regeneration and fresh review. No silent rebase, partial acceptance or automatic evidence verification.

Acceptance changes only that local placement and preserves exact support. Library promotion remains a separate explicit action. Rejection removes all live generated payload copies, including idempotency/audit copies, while keeping minimal decision metadata. Session undo after acceptance is a normal new draft edit; it does not erase proposal history or mutate old checkpoints.

## Responsive behavior and delivery boundary

Desktop reuses the existing shell, timeline/inspector and comparison split. The new sheets provide the missing states, not replacement navigation. On mobile, history is a single scroll column with real 44 px controls, saved checkpoint identity, earlier-page loading, review/download and restore entry. Branch confirmation is a full-height dialog/view with visible Cancel, scrollable content and safe-area spacing. The unchecked regeneration acknowledgment keeps Create branch disabled.

Mobile comparison stacks its input selectors and Before/After content. PDF review switches between clearly named originals, preserving each pane's page state; do not squeeze two unreadable pages side by side. Scoring uses a platform selector and independent result cards; the incompatibility reason stays above the scores. Long IDs and full passages wrap or open an accessible detail view. No horizontal clipping of actions or checkbox labels.

Use semantic forms, headings, tables/lists and labeled controls. Preserve focus when switching result/platform tabs, use visible focus and dialog focus restoration, and announce real save/operation changes without announcing every poll. Do not rely on color alone for pass/failure/freshness. Dark mode uses the existing semantic palette; source/PDF content retains its own document presentation.

These additions need contract extensions for optional checkpoint labels, durable branch origin, immutable comparison inputs, scoring runs/identities/capabilities and finding decisions, plus the canonical fixture qualification manifest. They do not require changing the prescribed application boundaries. All commands retain shared Owner authorization, schemas, atomic revision/reference guards, permanent idempotency and audit. External Agent Credentials gain no resume/template/history mutation authority.

All new Paper boards were screenshot-reviewed and finalized, with mobile control wrapping, disabled regeneration/working-draft score states, complete platform rows and PDF revision labels corrected during design. No browser, deployment, domain or implementation verification is claimed by this handoff.

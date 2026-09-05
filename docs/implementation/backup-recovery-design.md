# Settings backup status and recovery handoff

Updated 2026-09-05. A dedicated Paper subagent designed these states before implementation. This task owns Paper and this document only. No application code was edited or verified.

Use [River App UI](https://app.paper.design/file/01M1PCGGJYH2EC4YRJNZSPRDZK/3-0) for presentation, [PLAN.md](../../PLAN.md) for retention and release requirements, and [recovery.md](recovery.md) for the operator backup/restore procedure. Parent-provided current context supersedes that document's older credential-unavailable deployment note: daily backup is enabled, but its first live export/storage run failed. This handoff does not claim a retained live success.

## Paper map

Preserve the existing Settings shell, logo, palettes, Newsreader, Instrument Sans and IBM Plex Mono. The new desktop board is the existing 1236px Settings content region, with its 832px main area and 404px inspector. It is not another application shell. Read exact JSX and computed styles from Paper; screenshots are visual checks.

| Surface | Exact Paper nodes |
| --- | --- |
| Existing Settings | Board `22B-0`; heading `24B-0`; tab strip `24E-0`; new Backups entry `9QV-0` |
| 93 · Settings backups · Daily status and safe attempts | Board `9QX-0`; cloned Settings heading `9QY-0`; active Backups tab `9R6-0`; content region `9R8-0` |
| Latest dated attempt | Status column `9R9-0`; date/state/stage/count `9RF-0`; Retry failed backup `9RP-0`; Inspect failure `9RR-0` |
| Last retained success and history | Empty retained state `9RV-0`; dated attempt list `9S0-0`; attempt row `9S3-0`; earlier daily dates `9SD-0` |
| Safe inspector and operator reference | Inspector `9RC-0`; exact attempt identity `9SI-0`; failure details `9SP-0`; safe copy `9SS-0`; procedure region `9SV-0`; disclosure trigger `9SZ-0`; expanded reference `9YR-0`; copy reference `9YU-0` |
| 94 · Backup status and bounded recovery / Dark | Board `9T3-0`; queued attempt `9U6-0`; running stage `9UI-0`; cancellation requested `9UV-0`; Cancelled/retry `9V4-0`; exhausted date `9VG-0` |
| Retention, unavailable and races | Retained-success alternative `9VT-0`; unavailable credential/configuration `9W3-0`; preserved attempt list `9WG-0` and rows `9WM-0`, `9WX-0`, `9X8-0`; concurrent retry recovery `9XJ-0` |
| 95 · Mobile settings backup status | Board `9T4-0`; reused mobile header `9TQ-0`; body `9U1-0`; latest attempt `9XR-0`; actions `9Y0-0`; expanded safe details `9Y7-0`; retained state `9YG-0`; procedure `9YL-0`; expanded reference `9YY-0` |

These are alternative states, not simultaneous statuses. All pictured dates, times, Operation labels and counts are neutral illustrations. Do not seed them into the application. The light/default example correctly permits **None yet** for retained daily backups.

## Settings behavior

The Owner opens Backups within existing Settings. Show the actual deployment/environment label where relevant, latest daily UTC date, current application attempt number and limit, Operation state, current safe stage, and last-updated timestamp. Keep the daily date explicit as UTC even if other times use a localized display. Do not relabel a previous date's run as today's run or infer success from an installed credential.

Show **Last retained daily backup** separately from the latest attempt. A failed, running or cancelled attempt must not replace an earlier retained success. A retained result requires confirmed export and manifest publication; show its actual completion and scheduled expiry with safe metadata inspection. An expired or missing artifact cannot remain labeled retained. A successful backup is not evidence that a restore drill or remote cutover has passed.

With no completed retained daily result, show **None yet**. Loading or a failed status request is not an empty backup history. Retain previously loaded information with a stale/read-failure indication, provide Refresh status, and withhold mutation actions until the server can confirm eligibility. The history remains available when backup execution credentials are unavailable.

The dated history lists every application attempt in order with its own Operation identity, state, timestamps and inspection action. Selecting a prior attempt leaves the latest status and last retained success visible. Earlier daily dates use pagination; they do not start new backups or change the retry's target date. Return from inspection preserves selection and scroll. A completed attempt has no retry action.

## Retry and cancellation contract

The implementation agent confirmed **three total application attempts per UTC date**, including the initial scheduled attempt. Failed and Cancelled attempts consume this budget. Internal Workflow step retries are distinct; they do not increment or masquerade as the displayed daily application count.

**Retry failed backup** is available only for a currently Failed dated attempt with remaining budget and valid execution configuration. The equivalent Cancelled state uses **Retry backup**. The action names its exact UTC date and explains that a new attempt is created. No confirmation dialog is necessary for this bounded non-destructive request.

The new attempt gets a new Operation and immutable artifact identity. Retain the previous attempt, safe failure metadata and any existing immutable artifacts. A retry cannot overwrite a prior successful export, manifest or failed attempt record. Publishing the new result cannot make old attempt history disappear.

Use Owner authorization, permanent command identity and an atomic guard over the observed daily state, current attempt/Operation, remaining budget and execution configuration. Commit the new attempt/Operation, dispatch and audit together. Concurrent clicks, tabs or request retries must not create competing daily attempts. Replay the same command outcome. If another request has started a new attempt, show the refreshed current state (`9XJ-0`) instead of silently creating another. Late callbacks from older attempts must not overwrite the day's newer status or artifact references.

Queued and Running states show the real safe Operation stage and permit the existing cancellation command when eligible. **Cancellation requested** remains distinct from terminal **Cancelled**. Do not mark the date protected, offer a parallel retry, or refund an attempt while cancellation is pending. If completion wins the race, display the actual retained completion. If cancellation wins, a further explicit retry still uses the next daily attempt.

At three attempts, remove retry and show **Daily attempt limit reached**. There is no automatic repeat for that date after exhaustion. The next UTC date has a separate scheduled identity and budget. The operator procedure remains accessible; UI refresh, reauthentication, cancellation or a new idempotency key cannot reset the daily cap. Recoverable dispatch/finalization and bounded internal step retries remain governed by the existing Operation contract within their original attempt.

## Safe diagnostics and unavailable configuration

Read-only detail exposes an allowlist: daily date, application attempt number/limit, Operation identity, state, timestamps, safe transfer-stage name, stable safe failure code and redacted user-facing explanation. The implementation agent confirmed allowlisted transfer-stage diagnostics. Do not invent a finer stage than the server reports or display an invented progress percentage.

**Copy safe diagnostic details** copies only that same allowlist. Never include SQL contents, raw export responses, credential values, signed URLs, stack traces with raw provider data, request headers, or hidden Operation input/output payloads. Object download/SQL export controls are outside this Settings surface. A retained backup inspector may include validated format, sizes and digests only when its read model supports them safely.

If the credential or required resource configuration is unavailable, show an actionable unavailable state and the operator procedure reference. Do not render a credential-entry form or expose its value. Hide or disable retry with the reason until configuration is restored. A requested attempt that encounters a later credential failure remains a saved failed attempt; it is not deleted or converted into a successful status. Refreshing status only rereads capability and history.

## Operator procedure and narrow behavior

The confirmed action opens an **inline disclosure**, not a new route or a nonexistent hosted documentation link. The disclosure names `docs/implementation/recovery.md`, provides **Copy procedure reference**, and points the operator to its Backup and Isolated restore drill sections. The repository reference is the exact text copied. Existing procedures describe the required retained receipt, isolated verification and separately reviewed cutover. This interface does not execute a restore, in-place Time Travel, resource switch, or artifact deletion.

On mobile, reuse the existing header and Settings navigation. Stack latest status, actions, inspected safe details, retained status and the operator reference. The depicted failure-details section is expanded after Inspect; implement it as a labeled disclosure or the existing mobile inspection pattern. The same dated history and recovery states stack into one column. Use 16px body text, actions at least 44px tall, safe-area spacing and scrollable full details. Never shrink a desktop table into unreadable text.

Use semantic buttons, labeled disclosures, visible focus and keyboard navigation. Restore focus to Inspect when closing details. Announce stage and retry outcomes without stealing focus. Always label state in text; color alone does not distinguish failure, cancellation, retention or exhaustion.

## Required service additions

| Capability | Minimum contract |
| --- | --- |
| Read backup status | Owner-only safe read model: configuration availability, latest dated attempt, count/limit, state/stage, last retained unexpired success and allowed actions |
| Read date/attempt history | Cursor-paged dated records and preserved per-attempt Operations; safe metadata only |
| Retry backup | Explicit date, observed latest attempt/state, permanent command identity; atomic three-attempt guard and new immutable attempt/Operation/dispatch |
| Cancel backup | Exact active Operation identity and existing cancellation semantics; no budget refund or deletion |
| Read/copy diagnostics | Server-produced allowlisted fields; exclude raw export/SQL/credential/signed-URL content |

These extend existing backup persistence and Operation services. They do not expand Agent Credential scopes or require a new app shell. The design task does not change the operator procedure, application code or deployment status. All changed Paper nodes were screenshot-reviewed for spacing, hierarchy, contrast, aligned rows, mobile sizing and complete artboard fit, then finalized.

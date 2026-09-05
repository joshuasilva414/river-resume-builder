# Reusable library milestone

Updated 2026-09-05. Paper was designed by a dedicated subagent before implementation; see `content-design.md`.

The library supports seven scalar wording types: contact/header, summary, experience, project, education, skill, and credential. Typed Blocks bind exact Content Revisions into registered fields. Sections bind exact Block Revisions in reading order. Private labels are not printed. Dates and contact values are explicit wording; no live profile binding is implied.

Saves create immutable revisions. A current-item pointer, child/evidence reference indexes, audit record, and permanent idempotency outcome commit in one guarded D1 batch. Kind/type cannot change on an existing identity. Cross-owner references and external-agent mutations are rejected. Concurrent saves have one winner. Graphs are limited to 300 distinct immutable nodes; each revision is bounded to 128 KiB. Repeated bindings have distinct stable IDs.

Evidence links retain exact claim/revision identities. The UI shows the decision for that revision, plus independent stale, archived, and unsupported issues. A newer library or Evidence Revision does not silently replace an existing binding. No AI-generated candidate wording is seeded.

The Paper interface includes library browsing, search, type filters, pagination, revision history, complete wording inspection, nested Content/Block/Section editors, exact evidence pickers, and explicit conflict comparison. Saving a child does not submit its enclosing editor.

Validation: four library service tests cover immutability, ownership/type compatibility, exact retries/concurrent saves, and evidence staleness. The full Workers suite passed 29 tests before composition work began. All six workspace type checks/lint and the staging build passed. Browser checks created a linked Content Item, Block and Section; editing the original Content Item left the Section's original wording intact and showed that a newer revision was available. Hosted persistence survived reload. Desktop light and narrow hosted dark views were inspected. No 390px browser emulation claim is made.

Staging library deployment: `42be77c2-b279-474b-a72d-ca2f5f7e3cf0`, additive migration `0006_wet_slapstick.sql`. A clearly labeled unsupported synthetic library fixture exists solely for acceptance testing. Composition work follows separately; this milestone is not MVP completion.

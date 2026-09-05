# Canonical template ATS qualification

Foundation implemented locally on 2026-09-05. The Paper contract is board 75 in `history-scoring-design.md`. Durable fixture runs, Owner application services, the review interface and actual provider qualification remain to be implemented. No template has an `ATS Screener tested` designation from this work.

## Exact synthetic inputs

`packages/templates/src/ats-fixtures.ts` defines the separate scoring set `river-ats-fixtures-v1`. Its digest is `40f60e80ba854e4686ec6a4b307cdc8984df2731976d203d3c0551d4f2e1f9ba`. Capture retains every complete resolved document and fictional job description, plus their individual digests. A contract test pins the set version and complete digest. Input changes require a reviewed new version and qualification.

| Required fixture | Coverage | Extracted résumé units | Job units | Rendered pages |
| --- | --- | --- | --- | --- |
| `graduate-web` | All seven types, internship and project | 1,772 | 598 | 1 |
| `experienced-platform` | Multiple roles and longer page flow | 3,123–3,124 | 678 | 2 |
| `unicode-application` | Accents, C#, C++, currency and escaped characters | 1,555 | 571 | 1 |

These names, employers, qualifications and achievements are fictional test data. The fixture module never queries Owner evidence, sources, profiles, jobs or resumes. Normal rendering fixtures and negative validation cases remain separate; their successes do not grant this designation.

## Qualification rule

`qualifyAtsTemplate` evaluates completed evidence for one exact graph under `river-template-ats-qualification-v1`. It requires exactly one selected completed run for every required fixture, unique run identities, the current canonical-set digest, exact document/job inputs, the pinned graph and renderer, complete local validation, report-byte integrity and compatible resource identities. Input preflight uses actual extracted strings. It never submits an excerpt to fit the adapter limits.

Every provider response is schema-validated for all six unique simulations. Each must report `passesFilter: true`. Missing coverage or reported model identity, differing endpoints/adapters, and incompatible rubric/model/deployment/request identities withhold qualification. Canonical fixtures intentionally use different jobs; their exact job text is validated independently. This is separate from checkpoint score comparison, which requires the same posting snapshot.

Full validated findings and per-fixture failures remain inspectable. The rule retains the digest of the exact raw response string and never calculates a cross-platform average. A passing in-memory decision is not a persistent badge: the pending service must verify retained artifacts, commit a complete immutable report and associate it with the exact template revision.

## Verification and remaining delivery

All 32 template tests pass, including four qualification cases for complete sets, substituted/missing/duplicate evidence, graph/resource/identity changes, malformed/failed simulations, incomplete reports and oversized text. The 21 focused Workers template/scoring tests pass. Workspace types/lint and the staging build pass.

The offline Container suite rendered all nine fixture/pack combinations with complete text integrity. The longer fixture spans two pages in Classic, Minimal and Technical. All actual strings fit the 6,000/4,000 UTF-16 scoring limits. Existing fixed/custom packs, source refinement, repeatability, extraction, prohibited constructs and resource limits also passed. Peak memory was 412,729,344 bytes. This is rendering proof, not a live scoring result.

The fixture generator is now a checked TypeScript entry point instead of inline build-script source. Runtime artifacts remain private ignored test outputs. Logs: `/tmp/river-ats-qualification-tests.log`, `/tmp/river-ats-qualification-workers.log`, `/tmp/river-ats-qualification-types.log`, `/tmp/river-ats-qualification-lint.log`, `/tmp/river-ats-qualification-build.log`, `/tmp/river-ats-canonical-documents.log`.

Next: capture a complete qualification manifest and graph in Owner-scoped persistence; run bounded document/provider attempts through durable Operations; preserve selected results and failed history; atomically retain the complete report; connect Paper's fixture matrix and historical designation. No real provider submission or new UI control is claimed here.

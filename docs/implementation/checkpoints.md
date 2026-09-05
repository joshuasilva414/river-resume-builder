# Checkpoints and document review

Updated 2026-09-05. Presentation follows Paper's export handoff before implementation.

## Saved input and review

Capture freezes the acknowledged draft revision, immutable library graph, exact evidence material and historical contexts, posting snapshot, complete rendered text locators, and fixed template inventory. Capture, initial review, Operation, dispatch, audit, and idempotency receipt commit in one guarded D1 batch. Concurrent draft changes cannot alter the checkpoint. A replay returns the original capture even after newer edits.

Each affected wording occurrence has its own Draft, Needs clarification, stale, archived, or unsupported issues. Multiple issues can apply together. A report digest identifies the exact issue set and policy version. Acknowledgments apply only to that checkpoint/report/issue. Refresh and export recheck live evidence and context state. A changed issue set creates a new immutable report and requires renewed review. Export freezes the original report and acknowledgments; later evidence changes cannot rewrite that record.

Compilation, prohibited constructs, and text integrity block export. Evidence acknowledgment cannot bypass them. Retrying a failed document job keeps its captured input and is limited to three attempts. Deterministic text-integrity failure retains inspection artifacts but cannot retry unchanged input. Cancellation and late results preserve terminal application state.

## Template and artifact identity

Classic, Minimal, and Technical each contain a document manifest, six non-header section manifests, and all seven block manifests. Typed scalar slots escape once. Only compositor-owned child fragments enter child slots, with level/type/style compatibility checks. A closed macro/package/environment vocabulary rejects prohibited source constructs. Fixed packs use inherited style tokens; custom child overrides, lifecycle review, and cross-pack mixing remain Phase 2 work.

`river-tectonic-0.2.0` pins the full template inventory. `river-text-nfkc-v2` normalizes Unicode compatibility forms, typographic quotes, bullet separators, soft hyphens, and whitespace. It checks full normalized equality, expected token multiplicity, and reading order. Reports retain complete expected/extracted strings, stable input locators, the first differing field, actual page count, and bounded compiler layout warnings.

The Workflow writes PDF, LaTeX, extracted text, and validation JSON to immutable R2 keys before publishing the manifest. Checkpoints use `retained/checkpoints/`; previews use `transient/previews/` and expire after seven days. Protected downloads require Owner access and, for checkpoint download links, a completed export record. Failed integrity outputs remain available for authenticated inspection. Inline preview is an inspection capability, not DRM.

Preview coalescing includes the acknowledged draft revision and exact template inventory. The last successful PDF remains visible with freshness/revision labels; obsolete results cannot publish as current. The viewer supports actual page navigation, fit width, and zoom. Complete-input warm render reuse is implemented and locally verified; every Operation still retains its own artifact manifest and publication guards. See `render-cache.md` for limits and deployment status.

## Validation and deployment

- Thirty-nine Workers tests pass, including frozen captures, stale guards, per-issue acknowledgment, report changes, immutable exports, Owner/Agent boundaries, historical contexts, and preview expiry/template changes.
- Ten template tests and offline document fixtures pass. Fixtures cover all seven content types across all three packs, Unicode, repeated wording, escaping, missing/order errors, malformed sources, and resource limits. Peak fixture memory was 418,217,984 bytes under the 512 MiB test limit.
- Local browser acceptance covered capture, five individual acknowledgments, compile failure and retry, PDF/text/report inspection, export/history/download action, zoom, and Page 2 of a two-page PDF. Undo restored the temporary long fixture.
- Hosted acceptance captured draft revision 1, preserved it through two failures, compiled on retry, saved its one explicit synthetic unsupported acknowledgment, and exported. PDF/text/report and protected download action passed. Anonymous artifact access returned 401. Desktop 1280px and hosted 621px light/dark views were reviewed; 390px application testing remains unverified.

The hosted failure was Container lifecycle forwarding after image deployment, before compilation. DocumentService now performs a bounded explicit `startAndWaitForPorts` RPC before forwarding the body and uses the actual health endpoint. The same checkpoint subsequently succeeded. Exact Worker/image/checkpoint identities are in `deployment.json`. This is a successful recovery observation; it does not establish that every deployment/cold-start failure has been eliminated.

The fixtures are synthetic. The real Owner tailoring session, automatic daily backups, remaining authentication recovery checks, reviewed AI, and later phases still gate release.

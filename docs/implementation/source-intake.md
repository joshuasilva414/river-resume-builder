# Source intake contract

Implemented in M2's first slice. Claims now cite exact processing results through the [evidence workflow](evidence.md); job tailoring remains separate work.

## Owner workflow

Open Sources, add a title, then paste text, choose a PDF/DOCX/TXT/Markdown file, or record an Owner attestation. Optional URL and provenance notes are retained with the original; URLs are never fetched. Source text is extracted by the private document Container. The inspector shows original downloads, current text, parser identities, and all completed extraction versions.

Original content and provenance never change. Retrying extraction creates a new Operation and processing identity. The previous result remains available. Identical content from separate submissions retains separate source identities and provenance. Source UI search covers the latest 200 sources. The evidence bank has separate paginated FTS5 search and structured filters.

## Agent REST capabilities

All endpoints accept an Owner session or a named Bearer credential with the specified scope. Cookie-authenticated mutations require a same-origin Origin header. Mutations validate Effect schemas, derive the actor from authentication, and retain permanent idempotency receipts and audit entries. Errors use Problem Details and private responses use `Cache-Control: private, no-store`.

| Endpoint | Scope | Input and behavior |
| --- | --- | --- |
| `GET /api/v1/sources` | `source:read` | Latest 200 source summaries, including current processing identity and observed revision |
| `POST /api/v1/sources` | `source:write` | Title, filename, supported MIME, kind, nullable provenance URL, note, base64 content, idempotency key. Returns the stable source ID. |
| `GET /api/v1/sources/:id` | `source:read` | Current extracted text, stable UTF-16 character offsets, page/line locators, parser/version, and historical processing metadata |
| `GET /api/v1/sources/:id?processingId=:resultId` | `source:read` | Exact historical extraction; rejects a result from another source |
| `GET /api/v1/sources/:id?download` | `source:read` | Protected original attachment |
| `POST /api/v1/sources/:id` | `source:write` | ID, observed revision, idempotency key. Retries extraction after Ready/Failed. Returns the new Operation ID. |
| `PUT /api/v1/sources/:id` | `source:write` | ID, observed revision, idempotency key, original base64 bytes. Resumes an interrupted upload without replacing content. |

Source kinds are `document`, `pasted`, `structured`, and `attestation`. Only the Owner can create an `attestation`. Structured clients serialize their source material into the supported text formats and retain the original serialization. The `/mcp` facade exposes the same scoped source services. No external resume/template mutation is exposed.

## Persistence and recovery

1. Reserve the immutable source metadata, upload key, Operation, dispatch record, audit entry, and receipt in one D1 batch.
2. Store the exact original at a source-specific, digest-qualified private R2 key. Conditional writes prevent overwrites. R2 validates the SHA-256 checksum. The [R2 Workers contract](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/) defines conditional uploads and checksum validation.
3. Mark the upload ready for processing. Pending-dispatch queries exclude incomplete uploads so they cannot fill the dispatch queue and prevent other jobs from starting.
4. Dispatch a Workflow using the persisted Operation ID. A scheduled reconciliation checks uploaded objects by size and digest and finishes interrupted finalization. If the bytes never reached R2, the Owner can resume through the inspector, even after a reload.
5. Run extraction with bounded retries in the document Container. Save its exact output under a processing-ID and digest-qualified R2 key, then atomically publish the processing row, current source pointer, and completed Operation. A cancelled/failed/superseded Operation cannot publish a late result.
6. Retain earlier results when extraction fails. The original remains downloadable; the UI shows the failure and retry action.

The periodic upload reconciliation checks at most 50 incomplete uploads per run. There is no automated removal of never-finished reservations or unreachable extraction objects yet. Production diagnostics and cleanup policies remain release work.

## Limits and validation

Originals: 1 byte–10 MiB. Requests: 15 MiB at REST transport, including base64 and metadata. Text: 500,000 characters. PDF: 100 pages. The document runtime enforces the parser limits and rejects malformed PDFs, DOCX archives, base64, and UTF-8. The source service also rejects unsupported provenance schemes and credential-bearing URLs.

Five source integration tests exercise concurrent retries, permanent idempotency conflicts, separate provenance for identical bytes, protected original reads, interrupted finalization, exact-byte upload resumption, historical result immutability, stale retries, and Owner-attestation restrictions. Existing document fixtures cover representative PDF/DOCX extraction. Local browser acceptance covers text upload with repeated passages and Unicode, extraction retry, historical text inspection, and the responsive Paper interface.

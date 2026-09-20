> Superseded for active workflows by [ADR 0016](0016-use-facts-visual-documents-and-browser-pdf.md). Retained as historical context.

# Use one isolated document runtime

The monorepo will contain an `apps/documents` deployable whose Worker-backed Container handles both untrusted source parsing and resume compilation. It exposes only typed `extract-source`, `compile-resume`, and `validate-template` jobs with allowlisted inputs and outputs. PDF and DOCX extraction, Tectonic compilation, PDF text extraction, and validation run as separate bounded commands in disposable job environments; no general command endpoint or persistent Owner container exists. This applies one security and resource boundary without introducing distinct ingestion and compilation services.

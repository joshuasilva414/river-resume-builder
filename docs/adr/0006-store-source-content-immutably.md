# Store source content immutably

Original Source Artifact content will be stored immutably in private R2 with its SHA-256 identity and provenance metadata in D1. Each parser output is retained as a Source Processing Result identified by the parser and version that produced it. Identical content may share one stored blob, but its distinct provenance records are never merged automatically.

# Use typed template manifests and LaTeX fragments

Each Template Revision will combine an Effect-Schema-validated Template Manifest with LaTeX fragments. The manifest declares the template level, compatible content and child types, style contract, inherited and overridden tokens, assets, typed slots, and validation metadata. A deterministic compositor builds the document from Document, Section, and Block fragments. Scalar slots are escaped according to their declared types, and only explicit child-output slots may contain already-rendered LaTeX.

V1 will not execute template scripts, arbitrary functions, application data access, or a general-purpose template language. This keeps AI-generated templates expressive at the LaTeX layer while preserving a small execution surface and enforceable composition rules. A sandboxed Liquid- or Handlebars-style engine may be reconsidered later if real template requirements justify its additional grammar and security boundary.

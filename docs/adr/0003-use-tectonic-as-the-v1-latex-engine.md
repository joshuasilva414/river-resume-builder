# Use Tectonic as the V1 LaTeX engine

Resume Builder will use a pinned Tectonic release, bundle, fonts, and assets for preview, validation, and export. The authoritative editor preview is a debounced Tectonic-generated PDF; obsolete compile requests are coalesced, and the last successful PDF remains visible with a stale or compiling state. Render results are content-addressed, draft previews expire through an R2 lifecycle policy, and checkpoint or exported artifacts are retained. An HTML approximation may be investigated later but cannot become the rendering source of truth.

V1 template compatibility will target a pinned Tectonic executable, support bundle, font set, and container image. Compilation runs offline in an isolated, disposable container with untrusted and deterministic modes enabled. A conventional TeX Live engine remains a possible later adapter if real template requirements justify its larger image and broader execution surface.

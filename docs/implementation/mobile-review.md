# Phone review verification

Checked 2026-09-05 against personal staging with the supported Chrome viewport override at **390 × 844 CSS pixels**. `window.innerWidth` confirmed 390; this is an actual viewport check, unlike the earlier ineffective override. The override was reset afterward. These checks used retained synthetic fixtures and did not create evidence, checkpoints, scores or review attestations.

| Surface | Observed behavior |
| --- | --- |
| Sources | Both retained originals load as Ready. Cards and titles wrap; page width stays within the viewport. |
| Checkpoint history | Light/dark full-screen dialogs show current draft r4, its saved r0 checkpoint, lineage and review actions. Escape restores focus to History after the close lifecycle completes. |
| Exact comparison | The saved r0 checkpoint and saved working draft r4 load independently. Expanded full content remains within the dialog. Mobile Base PDF / Compare PDF controls display both actual retained PDFs, their distinct Operation IDs and matching revision state. |
| Wording review | Light/dark views display original/proposed wording, complete rationale, support and the retained acceptance at r3 while the draft stays r4. Composition and acceptance controls remain desktop-only. |
| Backup recovery | Light/dark status retains successful attempt 3 and allows inspection of failed attempt 2. Long IDs and safe failure details wrap. Expanding the operator procedure does not widen the page. No retry or attempt reset was submitted. |
| Scoring availability | The narrow dark dialog shows exact input counts, the unavailable provider, preserved export access and no fabricated results. Populated findings and compatible score comparisons still require live provider verification. |
| Retained export | The original exported checkpoint loads its passing report and PDF. The browser file-download action completed on its existing Download PDF link. A preceding download-event listener timed out for that new-tab link; no local downloaded-file checksum was measured in this check. |

Page scroll width was 375 pixels with the browser scrollbar, or 390 while a modal locked page scrolling. Inspected scrollable dialogs measured 373 pixels with matching scroll width. Horizontal navigation and settings tabs scroll within their own strips. Expanded comparison content did not cause page-level horizontal overflow.

## Keyboard correction

The wording queue originally captured the Open record button as a dialog's return target. Switching from the queue to a record unmounted that button, so closing the record left focus on the document body. Commit `61c0ac9` pins the persistent Wording proposals button through an optional dialog focus reference. Local browser checks prove record-to-close focus restoration and focus containment when returning to the queue. The deployed 390-pixel check also returns focus to Wording proposals. No visual design or page layout changed.

Web types, focused Biome checks and the staging build passed for this UI correction. The 141-test service suite passed for the preceding upload-recovery change; it was not repeated for this focus-only correction. The Worker is `6713b49e-c25b-428f-a27a-2059f83bee44`. The document Worker and Container are unchanged.

## Fixtures and remaining coverage

History baseline: checkpoint `01a072c6-9255-7d8f-bc16-f44d904b5c6b`; current draft `01a072c5-ae2a-7b48-b1a3-900b94ff1b7c`, r4. Comparison PDF Operations: `01a072c6-9255-7ba4-a78f-227d70cf9209` and `01a07313-0e47-77fc-858b-7d07437af265`. Wording task: `01a07311-6a9e-7cb5-9aaf-2fc36154b94b`. Retained export: checkpoint `01a07091-d743-76c2-a7ee-51294410467a`, PDF Operation `01a07095-99dd-744e-8d97-351520d5d9f8`.

This establishes the listed review states, not every mobile workflow. Live scoring/qualification results, source-publication acceptance and the real Owner tailoring session remain release work. No MVP or V1 release is claimed.

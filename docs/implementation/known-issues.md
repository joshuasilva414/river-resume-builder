# Known issues

## PDF-001 — PDF previews repeatedly flicker between rendered and loading states

Reported by Josh on 2026-09-05. **Possibly resolved; current behavior unverified.** Josh subsequently noted that it might already be fixed and requested recording the report and moving on. Retain this as historical evidence for later verification, not a confirmed current release blocker.

Evidence: [flickering-evidence.mov](/Users/joshuasilva/Downloads/flickering-evidence.mov), approximately 6.58 seconds at 30 fps. The recording is referenced locally and is not copied into Git.

### Observed behavior

- The recording shows the staging `/templates` page, Approved tab, in a desktop browser with dark appearance.
- Classic, Minimal and Technical each show page 1 of 1 at 75% zoom.
- All three previews repeatedly alternate between a rendered white PDF page and the `Loading PDF…` indicator while the page is idle. Frame-by-frame inspection confirms rapid repeated transitions, rather than a single initial load.
- The preview cards become shorter during loading and taller when the PDF appears. The page scrollbar and available horizontal space also change between these states.
- No navigation, editing or zoom change is visible during the repeated flicker. The Technical zoom control has focus, but the action that initially triggered the behavior is not captured.

Josh reports the issue with PDF viewers generally. The supplied recording directly confirms these three template previews; other viewer locations still need checking. The recording's exact application version and the root cause are unknown. A fresh live reproduction has not been attempted for this report.

### Expected behavior and verification

An already rendered PDF remains visible and readable while idle. Loading must not repeatedly replace an unchanged document or make the page layout oscillate.

Verify the eventual fix on the recorded template page with all three viewers visible at 75% zoom. Check idle stability, zoom changes and resizing, then cover the other shared viewer locations. Preserve the existing revision/freshness behavior and last successful preview during actual document updates.

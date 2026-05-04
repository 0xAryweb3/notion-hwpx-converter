# Table-Aware Visual Dogfood Plan

## Goal
Close the current visual QA blind spot: generated BRIEF outputs can contain correct title tables and one-cell structure motifs in HWPX XML, while the browser dogfood preview renders only top-level paragraphs. That makes it hard to inspect exactly the things the user keeps flagging: title table preservation, section-title tables, news-title tables, and stale table text.

## Current Evidence
- Current output audits for the three BRIEF samples pass with score 100.
- Generated HWPX XML contains title tables and structure tables.
- Existing `renderVisualDogfoodSvg()` intentionally skips `insideTable` paragraphs, so the preview image starts at generated body paragraph `1.` and hides table-rendered title/section motifs.
- Quick Look thumbnail generation for HWPX hangs on this machine, so we cannot rely on macOS thumbnailing as an automated Hancom proxy.

## Scope
Improve the visual dogfood layer only. Do not change HWPX generation semantics in this pass.

## Implementation Tasks
- [x] Extend `VisualDogfoodReport` with table summaries extracted from top-level and nested `hp:tbl` XML.
- [x] Track table text, row/column count, width/height, inside-anchor status, and page index.
- [x] Render table summaries into the SVG preview as framed blocks before/alongside paragraph text, so title tables and structure motifs are visible in generated screenshots.
- [x] Add regression coverage proving the SVG includes title-table and structure-table text that used to be invisible.
- [x] Regenerate visual dogfood reports for current BRIEF outputs.
- [x] Run `npm test`, `npm run build`, and `git diff --check`.

## Results
- Added table-aware visual dogfood summaries and SVG rendering.
- Regenerated table-aware reports and PNG previews:
  - `/Users/hyeon/Desktop/hwp-result/visual/current-7-8.table-aware.svg`
  - `/Users/hyeon/Desktop/hwp-result/visual/current-7-8.table-aware.png`
  - `/Users/hyeon/Desktop/hwp-result/visual/current-9-10.table-aware.svg`
  - `/Users/hyeon/Desktop/hwp-result/visual/current-9-10.table-aware.png`
  - `/Users/hyeon/Desktop/hwp-result/visual/current-6-7.table-aware.svg`
  - `/Users/hyeon/Desktop/hwp-result/visual/current-6-7.table-aware.png`
- The three reports still have `0` visual errors and `0` visual warnings. They now expose `tables` and `nonEmptyTables` counts in the report summary.
- Follow-up review fix: table row/column counts now fall back to counting `<hp:tr>` and `<hp:tc>` when HWPX omits `rowCnt`/`colCnt`, and table panel text separates paragraph text instead of fusing cells/paragraphs.

## Non-Goals
- No Hancom layout emulation.
- No PDF export.
- No renderer/style assignment changes unless a new concrete failure appears.

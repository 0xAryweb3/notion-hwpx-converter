# Quality Report Traceability Plan

## Goal

Make the generation quality report explain the generated formatting in the same terms a user sees in Hancom, especially for text color, structure-table assignments, and bullet indentation.

## Problem

The renderer now normalizes generated bullet paragraph styles into safe positive-left-indent output styles, but the UI quality report still displayed the sample's negative hanging-indent value as `내어쓰기`. That made correct generated bullet indentation look like the old bug. The assignment table also only displayed the first 12 rows, hiding later Notion sections such as `울산 소식`, `센터 소식`, and generated news-title structure tables.

## Implementation

- Add regression coverage proving bullet assignments expose a user-facing `글머리 들여쓰기` label instead of only the raw negative sample intent.
- Add color to `GenerationAssignmentRow` so users can inspect text color directly.
- Keep the raw indent value for diagnostics, but add `indentKind`, `indentValue`, and `indentLabel` for UI display.
- Show every assignment row in a scrollable UI table instead of truncating at 12 rows.
- Mark rows rendered as one-cell structure tables with `· 표` in the role column.

## Verification

- Targeted quality-report test must fail before the implementation and pass after it.
- Full `npm test`, `npm run build`, and `git diff --check` must pass before completion.
- Regenerated `/Users/hyeon/Desktop/hwp-result/current-*.json` reports must show black text, explicit structure-table rows, and positive user-facing bullet indentation labels.

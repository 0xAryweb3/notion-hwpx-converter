# Hancom Visual QA Runner Design

## Objective

Build a repeatable QA runner for the HWPX converter so every sample-based generation produces the HWPX file, JSON audit, SVG visual dogfood preview, and a run-level summary in one command.

## Problem

The converter now passes XML-level output audits and visual-dogfood checks for the current BRIEF samples, but user trust is still limited because Hancom can show issues that are not obvious from unit tests. Fully automated Hancom page navigation is blocked when macOS `System Events` automation permission is unavailable, so the next improvement should not depend on fragile app-control automation.

## Scope

This design adds a deterministic local QA run path. It does not change HWPX rendering semantics unless the QA runner exposes a concrete failing case in a later implementation round.

The first version covers:

- Generate multiple sample outputs from one source URL or source text.
- Write each `.hwpx` output and `.json` generation report.
- Write each visual-dogfood `.svg` preview.
- Write one `qa-summary.json` that aggregates audit status, visual status, table counts, page counts, and missing-source counts.
- Write one human-readable `qa-summary.md` for quick review.
- Open generated files in Hancom only as an optional helper step; the command must still be useful without Hancom automation.

## Non-Goals

- No OCR-based screenshot scoring in this slice.
- No automatic page-down control through `System Events` in this slice.
- No renderer refactor unless the new QA runner detects a failing gate.
- No network deployment, database, or external service changes.

## Architecture

Add a small reusable generation-report module under `src/features/hwpx/` so the existing `helper/generate-local.ts` and the new QA runner share one implementation. Add a QA summary module that aggregates several generated reports into stable pass/fail gates. Add `helper/qa-run.ts` as the CLI wrapper that reads source content once, loops over sample paths, writes artifacts, and optionally opens outputs in Hancom.

Data flow:

1. CLI parses source input, output directory, and sample list.
2. Source blocks are read once through the existing Notion/public-text pipeline.
3. Each sample is loaded through `loadHwpxTemplate()`.
4. Shared generation-report code calls `generateHwpx()`, `auditGeneratedHwpx()`, and `analyzeHwpxVisualDogfood()`.
5. CLI writes `.hwpx`, `.json`, `.svg`, `qa-summary.json`, and `qa-summary.md`.
6. Optional `--open-hancom` runs `open -a "Hancom Office HWP Viewer" <file>` for manual review.

## QA Gates

A QA run passes only when every sample report satisfies:

- `outputAudit.passed === true`
- output audit has zero errors and zero warnings
- visual dogfood has zero errors and zero warnings
- `missingSourceTextCount === 0`
- `badBulletIndentCount === 0`
- `badNonBulletIndentCount === 0`
- `badBulletStyleIndentCount === 0`
- `badNonBulletAutoHeadingCount === 0`
- `pageOverflowRiskCount === 0`
- `pageBottomTightRiskCount === 0`

The summary should still include warnings and counts even when the run passes, because the user needs inspectable evidence rather than a hidden boolean.

## CLI Shape

Example:

```bash
node_modules/.bin/vite-node helper/qa-run.ts \
  --source-url "https://galvanized-need-1fa.notion.site/BRIEF-9-2026-5-34f1e6afd42e8029a30bd4cb4b0523d6" \
  --output-dir "/Users/hyeon/Desktop/hwp-result/qa-current" \
  --sample "7-8::/Users/hyeon/Downloads/★2025년 7-8월 브리프.hwpx" \
  --sample "9-10::/Users/hyeon/Downloads/★2025년 9-10월 브리프.hwpx" \
  --sample "6-7::/Users/hyeon/Downloads/2025년 6-7월 브리프.hwpx"
```

Each `--sample` value uses `label::path`. The label becomes the artifact prefix.

## Testing

Use TDD around pure modules first:

- Generation-report module returns the same core report shape currently produced by `helper/generate-local.ts`.
- QA summary module marks a run as failed when any report has visual warnings or output audit warnings.
- QA summary markdown includes artifact paths and the key counts the user cares about.
- CLI argument parsing accepts repeated `--sample` values and rejects malformed sample specs.

Then verify with the real BRIEF samples and public Notion URL, writing artifacts under `/Users/hyeon/Desktop/hwp-result/qa-current`.

## Risks

- Hancom page counts may still differ from visual-dogfood page counts. The summary must state that visual dogfood is a deterministic proxy and keep room for manual Hancom notes later.
- Sample file paths contain decomposed Korean characters and spaces. The CLI must treat sample values as opaque strings and avoid shell-splitting assumptions.
- Public Notion fetching is network-dependent. The CLI must also support `--source-text` so tests and offline debugging remain possible.

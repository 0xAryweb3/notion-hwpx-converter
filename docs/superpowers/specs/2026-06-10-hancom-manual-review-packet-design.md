# Hancom Manual Review Packet Design

## Objective

Make each batch QA run produce a repeatable Hancom review packet, so the project can record later-page visual checks without depending on fragile macOS app automation.

## Problem

The converter now generates HWPX files, JSON reports, SVG previews, and a run-level QA summary. Those automated checks are useful, but they still cannot prove what Hancom Viewer shows on every page. Earlier attempts to drive Hancom through `System Events` were blocked by macOS permissions, and low-level page navigation produced unusable screenshots. The current workflow therefore leaves an evidence gap: a reviewer can inspect Hancom manually, but the QA artifacts do not tell them exactly what to check or where to record the result.

## Scope

Add a deterministic manual-review packet to the existing QA runner. Every `helper/qa-run.ts` execution should write a `hancom-review.md` file next to `qa-summary.md`. The file must be useful even when Hancom automation is unavailable.

The packet covers:

- One review checklist row per generated sample.
- Sample path, generated HWPX path, JSON report path, and SVG preview path.
- Expected visual-dogfood page count for each sample.
- Manual fields for Hancom page count, first-page status, later-page status, screenshot path, reviewer, and notes.
- A short review procedure that tells the reviewer to open the HWPX in Hancom, inspect page 1, inspect every later page, compare against the SVG preview and JSON report, then fill in the fields.
- A statement that the deterministic QA gates passed or failed separately from manual Hancom review.
- A link from `qa-summary.md` to `hancom-review.md`.

## Non-Goals

- No automatic Hancom page navigation.
- No OCR scoring.
- No screenshot capture automation.
- No HWPX rendering behavior changes unless this packet exposes a concrete failing output later.
- No remote service or deployment changes.

## Architecture

Keep this as a pure reporting enhancement inside `src/features/hwpx/qaRun.ts` and a small CLI write in `helper/qa-run.ts`.

Data flow:

1. `helper/qa-run.ts` generates samples exactly as it does today.
2. `buildQaRunSummary()` continues to calculate deterministic pass/fail gates.
3. A new pure function `renderHancomReviewMarkdown(summary)` creates the manual review packet from the summary.
4. `helper/qa-run.ts` writes `hancom-review.md` after `qa-summary.md`.
5. `renderQaRunMarkdown(summary)` mentions the manual review packet path.
6. The CLI JSON printed to stdout includes `hancomReviewPath`.

## User Outcome

After one QA command, the user gets a package that can be handed to any reviewer. They know which files to open, which pages to inspect, and where to record page count mismatches, screenshot evidence, and later-page defects. This turns the current open-ended manual Hancom step into a repeatable review artifact.

## Testing

Use unit tests for the pure Markdown function first:

- `renderHancomReviewMarkdown()` includes the generated HWPX, JSON, SVG, expected page count, and editable manual fields.
- The review packet includes a clear later-page checklist.
- `renderQaRunMarkdown()` links to `hancom-review.md`.

Then run:

- `npm test -- src/test/hwpx-qa-run.test.ts`
- `npm test`
- `npm run build`
- `git diff --check`

If sample files are available locally, run the real BRIEF QA command and confirm `hancom-review.md` is written under `/Users/hyeon/Desktop/hwp-result/qa-current`.

## Risks

- The packet does not make Hancom review automatic. It makes the manual step explicit and auditable.
- The expected page count is still the visual-dogfood page count, not Hancom's own page count. The packet must ask the reviewer to record Hancom's actual page count separately.
- A reviewer can still leave the packet blank. That is acceptable for this slice; the generated artifact is the missing workflow primitive.

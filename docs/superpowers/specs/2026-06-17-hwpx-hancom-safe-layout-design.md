# HWPX Hancom-Safe Layout Design

## Goal

Improve generated HWPX quality where it matters most: opening the file in Hancom should look stable, readable, and close to the sample document without requiring manual repair.

The product remains HWPX-only. This work does not add binary `.hwp`, PDF, DOCX, export presets, or a generic document-conversion layer.

## Problem

The current pipeline already extracts sample formatting deterministically and passes XML-level output audits plus SVG visual dogfood checks. The remaining quality gap is that Hancom can reflow the same HWPX differently from the proxy model. When that happens, users see issues such as unexpected extra pages, crowded page bottoms, table/text proximity problems, awkward wrapped tails, or section breaks that feel wrong even though the JSON report says the file passed.

The app should stop treating these cases as acceptable. It should generate more conservatively and report Hancom reflow risk as a first-class quality signal.

## Approach

Add an HWPX-only "Hancom-safe layout" layer across rendering and audits.

The renderer should reserve more space around risky generated content, especially generated paragraphs, bullet groups, source images, and cloned one-cell structure tables. The layout policy should prefer a slightly longer document over a document that opens cramped or reflows unpredictably in Hancom.

The audit path should expose a small set of Hancom-risk counters so a score of 100 means more than "the XML is internally consistent." The counters should flag:

- tight page-bottom headroom after generated content;
- generated tables that sit too close to following paragraphs;
- generated paragraph clusters that likely need a section gap;
- wrapped lines with very short tail fragments;
- visual proxy page counts that are likely optimistic.

These checks stay deterministic and HWPX/XML-based. They do not depend on screenshots, OCR, AppleScript, or Hancom automation.

## Rendering Rules

The default `generateHwpx()` path should use Hancom-safe behavior without requiring a UI toggle.

Rules:

- Keep preserving the sample title area and HWPX style extraction.
- Keep dropping template raster graphics by default.
- Keep source-driven body generation.
- Increase the generated page-bottom reserve above the current minimum when the next element is a heading, structure table, image, or bullet group.
- Insert real blank paragraphs or page breaks where section transitions would otherwise rely only on line-cache spacing.
- Keep bullet continuation lines indented deeper than the bullet marker.
- Avoid final wrapped tail lines that are too short to look intentional.
- Keep generated body alignment left-normalized unless the sample element is a preserved title or table motif where centered alignment is part of the motif.

## Audit Rules

`outputAudit` and `visualDogfood` should agree on user-facing risk categories where possible.

Add a `hancomReflowRiskCount` summary field to generation reports, derived from the relevant deterministic issues. The count should include page-bottom tightness, page overflow, table/paragraph collision risk, short wrapped tails, and any other issue that can plausibly cause Hancom-visible layout defects.

Existing hard failures remain hard failures:

- missing source text;
- non-black generated body text;
- generated non-bullet paragraphs with hanging indent or automatic bullet metadata;
- unexpected body data tables when the source has no table rows;
- preserved template graphics that should have been removed.

Hancom reflow risks should start as warnings unless they prove a definite overflow. Warnings should still be visible in the CLI summary and report JSON so batch QA cannot hide them.

## Report And UX Surface

For CLI and future UI work, generated reports should answer:

- Did the HWPX pass deterministic correctness checks?
- How many Hancom reflow risks remain?
- Which sample/output path should be opened for manual review?
- Which page or paragraph is risky?

The first implementation should update the JSON/CLI surfaces. The side panel can consume the same report model later; it should not be the first implementation target.

## Testing

Use RED/GREEN tests before implementation.

Targeted tests:

- renderer tests for extra reserve before generated headings, structure tables, and images;
- renderer tests proving short wrapped tails are avoided;
- visual dogfood tests for table-to-paragraph proximity risk and optimistic page-count risk;
- output audit tests proving `hancomReflowRiskCount` is included and increments for deterministic risks;
- report/CLI tests proving the risk count is exposed.

Verification:

- `npm test -- src/test/hwpx-render.test.ts`
- `npm test -- src/test/hwpx-visual-dogfood.test.ts`
- `npm test -- src/test/hwpx-output-audit.test.ts`
- `npm test -- src/test/generate-local.test.ts`
- full `npm test`
- `npm run build`
- `git diff --check`

## Non-Goals

- Do not add `.hwp` output.
- Do not add PDF or DOCX export.
- Do not depend on Hancom UI automation.
- Do not introduce LLM formatting guesses.
- Do not rewrite the renderer around a new document model.
- Do not make the UI the primary quality fix before the HWPX output itself improves.

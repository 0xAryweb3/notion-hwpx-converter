# Visual Regression Corrections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three visible generated-output regressions: unexpected blue generated body text, generated bullet hanging indent, and missing blank paragraph after bullet groups.

**Architecture:** Keep deterministic sample analysis, but add output-specific normalization. Format grammar should avoid non-black character styles for generated body roles. The auto renderer should clone bullet paragraph styles into generated-only paragraph styles with positive left indentation and zero first-line hanging indent, then insert a real blank paragraph between bullet groups and the next non-bullet block.

**Tech Stack:** TypeScript, Vitest, HWPX XML.

---

## File Structure

- Modify: `src/features/hwpx/formatGrammar.ts`
  - Normalize generated body/category/news roles away from non-black character styles.
- Modify: `src/features/hwpx/render.ts`
  - Clone generated bullet paragraph styles in `Contents/header.xml`.
  - Use real blank paragraphs after bullet groups.
  - Make line layout honor paragraph left/intent margins for generated styles.
- Modify: `src/features/hwpx/outputAudit.ts`
  - Treat generated bullet styles with negative `intent` as an audit error.
- Modify tests:
  - `src/test/hwpx-format-grammar.test.ts`
  - `src/test/hwpx-render.test.ts`
  - `src/test/hwpx-output-audit.test.ts`

## Task 1: RED Tests

- [x] Add a grammar test where a blue body heading sample exists and a similar black character style exists. Expected: generated `bodyHeading` keeps the paragraph style but uses the black character style.
- [x] Add a render test where a bullet sample has `intent < 0` and `left = 0`. Expected: generated bullet paragraphs use a cloned paragraph style whose header `intent` is `0` and `left > 0`, and first generated line starts after the margin.
- [x] Add a render test that an actual empty paragraph exists between the final bullet in a group and the next heading.
- [x] Add an audit test that a generated bullet paragraph using a negative-intent paragraph style fails.

## Task 2: Implement Formatting Normalization

- [x] In `formatGrammar.ts`, add character-style normalization for generated body roles: `bodyHeading`, `bodyParagraph`, `pageHeading`, `categoryHeading`, and `newsTitle`.
- [x] Prefer black, readable, non-table candidates with the closest font size and bold match. Do not change `title`, `issue`, `bullet`, or `newsBullet` role colors.
- [x] Keep paragraph normalization from the previous fix: non-bullet roles must not borrow negative-indent or centered title paragraph styles.

## Task 3: Implement Generated Bullet Paragraph Styles

- [x] Extend the render style context with paragraph style cloning.
- [x] Clone bullet/news-bullet paragraph styles on the auto body path only.
- [x] Set cloned bullet margins so `left = abs(intent)` and `intent = 0`, preserving other paragraph properties.
- [x] Make `renderLineSegArray` honor `left` and `intent` so line cache positions match the cloned paragraph style.

## Task 4: Implement Real Blank Paragraphs After Bullet Groups

- [x] Replace line-cache-only `extraAfterLines` behavior with an actual empty paragraph when a bullet/news-bullet is followed by a non-bullet generated assignment.
- [x] Ensure the inserted blank paragraph has a line segment and valid XML.

## Task 5: Verification

- [x] Run focused tests: `npm test -- src/test/hwpx-format-grammar.test.ts src/test/hwpx-render.test.ts src/test/hwpx-output-audit.test.ts`
- [x] Regenerate the three commercial audit outputs.
- [x] Inspect generated XML for non-black text, negative bullet intent, blank paragraph placement, and output audit scores.
- [x] Run `npm test`
- [x] Run `npm run build`
- [x] Run `git diff --check`

## Self-Review

- This plan deliberately avoids a broad visual rendering engine.
- It changes generated-output policy only; sample title tables and input table behavior stay unchanged.
- The audit must reject the exact issues the user reported so score 100 cannot hide them again.

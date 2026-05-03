# Visual Dogfood Audit Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a local visual dogfood loop that converts generated HWPX XML into an inspectable SVG/PNG-style preview plus stricter visual metrics, then use it to iterate on generated outputs instead of trusting unit tests alone.

**Architecture:** Create a deterministic visual inspection module that reads HWPX `header.xml` and `section0.xml`, extracts paragraph text, character styles, paragraph margins, line segments, and top-level table context, then renders a simplified SVG preview. A helper CLI writes SVG and JSON reports for generated outputs so reviewers can see obvious visual issues such as overlap, tiny headings, unexpected colors, missing paragraph gaps, and indent drift.

**Tech Stack:** TypeScript, Vitest, HWPX XML, macOS `sips` for SVG-to-PNG conversion outside the app.

---

## File Structure

- Create: `src/features/hwpx/visualDogfood.ts`
  - Extracts visual paragraph records.
  - Produces visual audit issues.
  - Renders an SVG preview.
- Create: `src/test/hwpx-visual-dogfood.test.ts`
  - Covers color, indent, gap, and SVG rendering behavior.
- Create: `helper/visual-dogfood.ts`
  - CLI for `--input <file.hwpx> --svg <out.svg> --report <out.json>`.

## Task 1: RED Tests

- [ ] Add tests for extracting paragraph text, style color/size, paragraph margins, and line positions from synthetic HWPX XML.
- [ ] Add tests for detecting non-black generated text, negative bullet style indent, missing blank paragraph after a bullet group, and vertical overlap risk.
- [ ] Add tests that `renderVisualDogfoodSvg` returns an SVG containing paragraph text and diagnostic highlights.
- [ ] Run `npm test -- src/test/hwpx-visual-dogfood.test.ts`; expected failure because the module does not exist.

## Task 2: Implement Visual Dogfood Module

- [ ] Implement `analyzeHwpxVisualDogfood(headerXml, sectionXml)` with paragraph/style extraction.
- [ ] Implement issue generation:
  - Error: non-black generated paragraph text outside preserved title tables.
  - Error: bullet paragraph style has negative `intent`.
  - Warning: bullet group followed by non-bullet without a blank paragraph.
  - Warning: non-empty paragraph vertical gap is negative or too small.
  - Warning: generated heading font size is less than generated bullet font size.
- [ ] Implement `renderVisualDogfoodSvg(report)` using scaled line positions and text color/size.

## Task 3: Implement CLI and Dogfood Outputs

- [ ] Add `helper/visual-dogfood.ts` that reads a HWPX ZIP, writes JSON report and SVG preview.
- [ ] Generate SVG/JSON previews for all three `commercial-audit-*` outputs.
- [ ] Convert SVG to PNG with `sips` and visually inspect the PNGs.

## Task 4: Verification

- [ ] Run focused visual dogfood tests.
- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Run `git diff --check`.

## Self-Review

- This is an approximation, not a Hancom renderer.
- It must not claim pixel-perfect rendering.
- It is valuable because it makes generated layout visible to the agent and catches regressions unit tests do not naturally catch.

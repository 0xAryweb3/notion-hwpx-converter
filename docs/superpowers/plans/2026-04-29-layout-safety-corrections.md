# Layout Safety Corrections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert overflow detection into a first corrective pass by splitting very long generated paragraphs before rendering while preserving source text coverage and measured sample styles.

**Architecture:** Add a `layoutSafety.ts` module between style assignment and rendering. It consumes `HwpxStyleAssignment[]`, estimates line count from measured sample line metrics and character size, splits eligible long paragraph assignments on sentence/space boundaries, and marks split fragments so output audit can still verify source coverage.

**Tech Stack:** TypeScript, Vitest, HWPX XML.

---

## File Structure

- Create: `src/features/hwpx/layoutSafety.ts`
  - Splits long paragraph assignments into render-safe fragments.
- Create: `src/test/hwpx-layout-safety.test.ts`
  - Unit tests for splitting, source coverage, and non-splitting roles.
- Modify: `src/features/hwpx/styleAssignment.ts`
  - Carry measured `line` metrics into each paragraph assignment.
  - Add optional `auditText` and `layoutFragment` metadata to support split coverage.
- Modify: `src/features/hwpx/render.ts`
  - Apply layout safety before rendering assigned body blocks.
- Modify: `helper/generate-local.ts`
  - Apply the same layout safety before generated-output audit.
- Modify: `src/features/hwpx/outputAudit.ts`
  - Use `assignment.auditText ?? assignment.text` for source coverage.

## Task 1: RED Tests

**Files:**
- Create: `src/test/hwpx-layout-safety.test.ts`

- [x] **Step 1: Test long paragraph splitting**

Create a long body paragraph assignment with measured line metrics and assert it splits into multiple paragraph assignments, each below the configured line threshold.

- [x] **Step 2: Test source coverage metadata**

Assert each fragment carries the original `auditText`, so generated-output audit can still validate the complete source text across split paragraphs.

- [x] **Step 3: Test protected roles**

Assert headings, titles, issue labels, category headings, news titles, table assignments, and image assignments are not split.

- [x] **Step 4: Run focused test**

Run: `npm test -- src/test/hwpx-layout-safety.test.ts`

Expected: fail because `layoutSafety.ts` does not exist.

## Task 2: Implement Layout Safety

**Files:**
- Create: `src/features/hwpx/layoutSafety.ts`
- Modify: `src/features/hwpx/styleAssignment.ts`

- [x] **Step 1: Add metadata to assignment type**

Add:
- `line?: HwpxLineProfile | null`
- `auditText?: string`
- `layoutFragment?: { index: number; count: number }`

- [x] **Step 2: Implement line estimation**

Use:
- `assignment.line?.horzSize ?? 42520`
- `assignment.line?.textHeight ?? assignment.fontSizePt * 100 ?? 1000`
- same chars-per-line formula as renderer

- [x] **Step 3: Implement split logic**

Only split paragraph roles:
- `bodyParagraph`
- `bullet`
- `newsBullet`

Do not split structural headings or tables/images.

- [x] **Step 4: Verify tests pass**

Run: `npm test -- src/test/hwpx-layout-safety.test.ts`

## Task 3: Renderer and Audit Integration

**Files:**
- Modify: `src/features/hwpx/render.ts`
- Modify: `helper/generate-local.ts`
- Modify: `src/features/hwpx/outputAudit.ts`

- [x] **Step 1: Apply layout safety in renderer**

Call `applyLayoutSafety(assignments)` before `renderAssignedHybridBodyBlocks`.

- [x] **Step 2: Apply layout safety in helper audit**

Use the same layout-safe assignments for `auditGeneratedHwpx`.

- [x] **Step 3: Use `auditText` in coverage check**

Generated output may contain split fragments; coverage should validate the original full assignment text through `auditText` when present.

- [x] **Step 4: Add render regression**

Add a test proving a long paragraph becomes multiple generated paragraphs and the audit has no missing source text.

## Task 4: Full Verification

- [x] Run `npm test`
- [x] Run `npm run build`
- [x] Run `git diff --check`
- [x] Regenerate the three commercial audit HWPX outputs and compare scores.

## Self-Review

- Scope is narrow: only long paragraph splitting before rendering.
- No PDF rendering, visual diff, font shrinking, or page reflow engine yet.
- Source coverage is explicitly preserved through `auditText`.

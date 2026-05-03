# Generated Output Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a generated HWPX audit engine that scores the actual output package for structural correctness before a user opens it in Hancom.

**Architecture:** Keep pre-generation quality checks in `quality.ts`, and add post-generation checks in a new `outputAudit.ts` module. The audit consumes source blocks, style assignments, template metadata, generated `section0.xml`, and generated `header.xml`, then returns score, pass/fail, summary metrics, and actionable issues.

**Tech Stack:** TypeScript, Vitest, fflate, HWPX XML.

---

## File Structure

- Create: `src/features/hwpx/outputAudit.ts`
  - Post-generation audit functions and types.
- Create: `src/test/hwpx-output-audit.test.ts`
  - Focused regression tests for table policy, bullet indentation, red style usage, source coverage, and overflow risk.
- Modify: `helper/generate-local.ts`
  - Replace local `inspectOutput` duplication with `auditGeneratedHwpx`.
  - Include score/pass/error/warning counts in console JSON.
- Modify: `src/features/hwpx/quality.ts`
  - Export `countTableGroups` for shared audit use.
- Modify: `README.md`
  - Document the post-generation audit report.

## Task 1: RED Tests For Generated Output Audit

**Files:**
- Create: `src/test/hwpx-output-audit.test.ts`

- [ ] **Step 1: Write failing tests**

Add tests for:
- source has no table rows but generated output has body tables
- wrapped bullet continuation line has `horzpos=0`
- generated output uses a red `charPr`
- source assignment text is missing from output
- long paragraph triggers overflow warning
- clean generated output passes with high score

- [ ] **Step 2: Run focused test and verify RED**

Run: `npm test -- src/test/hwpx-output-audit.test.ts`

Expected: fail because `outputAudit.ts` does not exist.

## Task 2: Implement `outputAudit.ts`

**Files:**
- Create: `src/features/hwpx/outputAudit.ts`
- Modify: `src/features/hwpx/quality.ts`

- [ ] **Step 1: Add audit types**

Define `GeneratedOutputAudit`, `GeneratedOutputAuditIssue`, `GeneratedOutputAuditSummary`, and `GeneratedOutputAuditInput`.

- [ ] **Step 2: Implement XML inspectors**

Implement helpers for:
- output table/body table counts
- picture/container counts
- red `charPr` ID lookup and run usage
- paragraph text extraction
- bullet paragraph line positions
- source assignment coverage
- line count estimation

- [ ] **Step 3: Implement scoring**

Start at 100. Deduct:
- 25 for each error
- 8 for each warning
- never below 0

`passed` is false if any error exists.

- [ ] **Step 4: Verify focused tests pass**

Run: `npm test -- src/test/hwpx-output-audit.test.ts`

## Task 3: Wire The Local Generator

**Files:**
- Modify: `helper/generate-local.ts`

- [ ] **Step 1: Replace local output inspector**

Use `auditGeneratedHwpx` and remove duplicate helper inspection code from the CLI.

- [ ] **Step 2: Console report**

Print `score`, `passed`, `errors`, `warnings`, `outputBodyTables`, `badBulletIndentCount`, and `missingSourceTextCount`.

- [ ] **Step 3: Verify helper generation**

Run the helper against the current public Notion link and 7-8 sample. Expected: output and JSON report are written, with no audit errors.

## Task 4: Full Verification

**Files:**
- Possibly update `README.md`

- [ ] **Step 1: Run full tests**

Run: `npm test`

- [ ] **Step 2: Run production build**

Run: `npm run build`

- [ ] **Step 3: Run whitespace check**

Run: `git diff --check`

- [ ] **Step 4: Regenerate three sample outputs**

Run `helper/generate-local.ts` for the 7-8, 9-10, and 6-7 samples and compare the audit summaries.

## Self-Review

- Spec coverage: generated-output table policy, image policy, style safety, bullet layout, source coverage, overflow risk, CLI report, and verification are covered.
- Placeholder scan: no open TBD/TODO placeholders.
- Type consistency: `GeneratedOutputAudit` names are consistent across tests, helper, and docs.

# Structure Motif Rendering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add deterministic structure-motif extraction so lead headings, page headings, category headings, and news titles can reuse one-cell heading tables from the sample while data tables remain source-driven.

**Architecture:** Extend the existing `formatProfile -> formatGrammar -> sourceStructure -> styleAssignment -> render` pipeline. The renderer will clone one-cell structure tables only for assignments explicitly marked as structure-table render targets. Multi-column body tables remain tied to source `tableRow` groups.

**Tech Stack:** TypeScript, Vitest, fflate HWPX ZIP parsing, existing XML string utilities.

---

### Task 1: Profile One-Cell Table Text

**Files:**
- Modify: `src/features/hwpx/formatProfile.ts`
- Test: `src/test/hwpx-format-profile.test.ts`

- [ ] Add `text` and `paragraphCount` to `HwpxTableProfile`.
- [ ] Populate those fields in `extractTableProfiles()` using existing paragraph text extraction.
- [ ] Add a regression test with one-cell and multi-cell tables proving table text and paragraph counts are exposed.

### Task 2: Infer Table Motifs

**Files:**
- Modify: `src/features/hwpx/formatGrammar.ts`
- Test: `src/test/hwpx-format-grammar.test.ts`

- [ ] Add `leadHeading` to `HwpxGrammarRole`.
- [ ] Add `tableMotifs` to `HwpxFormatGrammar`.
- [ ] Infer one-cell body table motifs:
  - first post-title one-cell table -> `leadHeading`
  - text `탄소중립 정보공유` -> `pageHeading`
  - text `센터 소식` or `센터운영소식` -> `categoryHeading`
  - repeated one-cell title-like body table after page heading -> `newsTitle`
- [ ] Keep `bodyTableTemplates` for data tables, but filter it to multi-column tables only.

### Task 3: Classify Lead Heading Source Nodes

**Files:**
- Modify: `src/features/hwpx/sourceStructure.ts`
- Test: `src/test/hwpx-source-structure.test.ts`

- [ ] Add `leadHeading` to `HwpxSourceNodeType`.
- [ ] Classify the first short body paragraph after title/issue and before the first numbered section as `leadHeading`.
- [ ] Keep numbered sections as `bodyHeading` so every numbered heading does not become a table by accident.

### Task 4: Carry Structure-Table Render Hints

**Files:**
- Modify: `src/features/hwpx/styleAssignment.ts`
- Test: `src/test/hwpx-style-assignment.test.ts`

- [ ] Add `renderAs?: "paragraph" | "structureTable"` and `structureTable?: { role, order, rowCount, colCount }` to `HwpxStyleAssignment`.
- [ ] Mark assignments as `structureTable` only when their grammar role has a matching `tableMotif`.
- [ ] Ensure data table assignments remain `type: "table"` and are not confused with structure tables.

### Task 5: Render One-Cell Structure Tables

**Files:**
- Modify: `src/features/hwpx/render.ts`
- Test: `src/test/hwpx-render.test.ts`

- [ ] Extract one-cell heading table templates from `titleRegion.bodyTemplateXml`, preserving global table order.
- [ ] For paragraph assignments marked `structureTable`, clone the matching one-cell table and replace all stale table text with the assignment text.
- [ ] Render regular paragraph assignments as before.
- [ ] Reserve approximate layout space after inserted structure tables so following generated paragraph line caches do not start at the same vertical position.

### Task 6: Update Audits For Structure Tables

**Files:**
- Modify: `src/features/hwpx/outputAudit.ts`
- Test: `src/test/hwpx-output-audit.test.ts`

- [ ] Treat assigned structure tables as allowed body tables even when the source has no table rows.
- [ ] Continue failing unexpected body data tables when no source table rows exist.
- [ ] Keep missing source text checks active for structure-table assignments.

### Task 7: Regenerate And Dogfood

**Files:**
- Generated outputs under `/Users/hyeon/Desktop/hwp-result/`

- [ ] Regenerate `commercial-audit-7-8.hwpx`, `commercial-audit-9-10.hwpx`, and `commercial-audit-6-7.hwpx`.
- [ ] Verify output reports distinguish structure tables from data tables.
- [ ] Run visual dogfood for all three outputs.
- [ ] Run `npm test`, `npm run build`, and `git diff --check`.


# Template Analyzer V2 Rule and LLM Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Do not use subagents unless the user explicitly asks for parallel agent work.

**Goal:** Rebuild the converter around a deterministic HWPX formatting analyzer that exposes page, paragraph, character, table, and cell measurements before any rule-based or LLM-assisted matching runs.

**Architecture:** Add a `HwpxFormatProfile` generated directly from HWPX XML. Both the rule-only and LLM-assisted pipelines consume this same profile; LLMs may choose semantic slot assignments, but never infer low-level style values. The UI surfaces the extracted measurements so commercial-quality fidelity can be inspected before generation.

**Tech Stack:** TypeScript, fflate ZIP parsing, Vitest/jsdom, React 19 side panel, existing local Codex helper for optional LLM matching.

**Execution Status:** Implemented. The deterministic analyzer is attached to `HwpxTemplate`, shown in the UI, covered by tests, and used for quality reporting. A follow-up hardening pass also changed preserved-template text replacement to use real XML ranges and to remove stale `hp:linesegarray` caches after text replacement.

---

## File Structure

- Create `src/features/hwpx/formatProfile.ts`: deterministic XML analyzer for page, paragraph, character, table, cell, and text-slot profiles.
- Modify `src/features/hwpx/template.ts`: attach `formatProfile` to `HwpxTemplate`.
- Modify `src/features/hwpx/quality.ts`: report analyzer coverage gaps.
- Modify `src/panel/App.tsx`: replace the shallow template summary with a measurable formatting dashboard and explicit rule/LLM pipeline labels.
- Modify `src/panel/styles.css`: dense commercial dashboard layout for analyzer cards.
- Create `src/test/hwpx-format-profile.test.ts`: unit coverage for margins, paraPr, charPr, table/cell metrics, and text slots.
- Modify `src/test/hwpx-quality.test.ts`: coverage warnings for missing page/paragraph/style/table metrics.
- Modify `README.md` and `HANDOFF.md`: document that v2 starts with deterministic format analysis.

---

### Task 1: Deterministic HWPX Format Profile

**Files:**
- Create: `src/features/hwpx/formatProfile.ts`
- Test: `src/test/hwpx-format-profile.test.ts`

- [ ] **Step 1: Write failing analyzer tests**

Add tests for:

```ts
expect(profile.page).toEqual({
  landscape: "WIDELY",
  width: 59528,
  height: 84186,
  margins: { header: 4252, footer: 4252, gutter: 0, left: 8504, right: 8504, top: 5668, bottom: 4252 },
  contentWidth: 42520,
  contentHeight: 74266
});
expect(profile.characterStyles[0]).toMatchObject({
  id: "7",
  fontFace: "한컴산뜻돋움",
  fontSizePt: 16,
  charSpacing: -3,
  widthRatio: 95,
  bold: true,
  textColor: "#111111"
});
expect(profile.paragraphStyles[0]).toMatchObject({
  id: "19",
  align: { horizontal: "CENTER", vertical: "BASELINE" },
  margins: { intent: 0, left: 100, right: 200, prev: 300, next: 400 },
  lineSpacing: { type: "PERCENT", value: 160 }
});
expect(profile.tables[0]).toMatchObject({
  order: 0,
  rowCount: 1,
  colCount: 1,
  width: 41954,
  height: 4471,
  cellCount: 1,
  firstCell: {
    width: 41954,
    height: 4471,
    margin: { left: 510, right: 510, top: 141, bottom: 141 },
    borderFillIDRef: "3"
  }
});
expect(profile.textSlots[0]).toMatchObject({
  ordinal: 0,
  text: "울산광역시 탄소중립지원센터 BRIEF",
  paraPrIDRef: "19",
  charPrIDRef: "7",
  insideTable: true
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- src/test/hwpx-format-profile.test.ts`

Expected: FAIL because `formatProfile.ts` does not exist.

- [ ] **Step 3: Implement `analyzeHwpxFormatProfile`**

Create exported types:

```ts
export interface HwpxFormatProfile {
  page: HwpxPageProfile | null;
  counts: { paragraphStyles: number; characterStyles: number; borderFills: number; tables: number; cells: number; textSlots: number; images: number };
  paragraphStyles: HwpxParagraphProfile[];
  characterStyles: HwpxCharacterProfile[];
  tables: HwpxTableProfile[];
  textSlots: HwpxTextSlotProfile[];
}
```

Implement with deterministic XML parsing helpers only. Extract:
- `hp:pagePr` attrs and nested `hp:margin`
- every `hh:charPr`: height, textColor, hangul font face, spacing, ratio, bold
- every `hh:paraPr`: align, margins, line spacing, tab ref, border fill ref
- every `hp:tbl`: row/col count, size, margins, cell metrics
- every non-empty `hp:p`: text, paragraph IDs, first run char ID, first line segment, whether inside a table

- [ ] **Step 4: Run focused tests**

Run: `npm test -- src/test/hwpx-format-profile.test.ts`

Expected: PASS.

---

### Task 2: Attach Profile To Template Loading

**Files:**
- Modify: `src/features/hwpx/template.ts`
- Test: `src/test/hwpx-render.test.ts`
- Test: `src/test/hwpx-format-profile.test.ts`

- [ ] **Step 1: Write failing integration assertion**

In the existing template-loading test, assert:

```ts
expect(template.formatProfile.page?.contentWidth).toBe(42520);
expect(template.formatProfile.tables[0]?.firstCell?.margin.left).toBe(510);
expect(template.formatProfile.textSlots.length).toBeGreaterThan(0);
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test -- src/test/hwpx-render.test.ts -t "loads template files"`

Expected: FAIL because `formatProfile` is not attached.

- [ ] **Step 3: Attach analyzer output**

Import `analyzeHwpxFormatProfile` in `template.ts`, add `formatProfile: HwpxFormatProfile` to `HwpxTemplate`, and set:

```ts
formatProfile: analyzeHwpxFormatProfile(headerXml, sectionXml)
```

- [ ] **Step 4: Run focused tests**

Run: `npm test -- src/test/hwpx-render.test.ts src/test/hwpx-format-profile.test.ts`

Expected: PASS.

---

### Task 3: Commercial Format Coverage Report

**Files:**
- Modify: `src/features/hwpx/quality.ts`
- Test: `src/test/hwpx-quality.test.ts`

- [ ] **Step 1: Write failing coverage tests**

Add tests that expect:

```ts
expect(report.issues).toContainEqual({
  severity: "info",
  message: "샘플 서식 분석: 페이지 여백, 문단 스타일, 글자 스타일, 표/셀 수치를 읽었습니다."
});
```

And for a malformed/minimal template:

```ts
expect(report.issues).toContainEqual({
  severity: "warning",
  message: "샘플 페이지 여백을 찾지 못했습니다. 출력 문서 여백 재현이 제한됩니다."
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- src/test/hwpx-quality.test.ts -t "서식 분석|페이지 여백"`

Expected: FAIL.

- [ ] **Step 3: Implement format coverage issues**

Use `template.formatProfile`:
- page missing -> warning
- no paragraph styles -> warning
- no character styles -> warning
- no text slots -> warning
- otherwise add one info summary message

- [ ] **Step 4: Run quality tests**

Run: `npm test -- src/test/hwpx-quality.test.ts`

Expected: PASS.

---

### Task 4: Analyzer Dashboard UI

**Files:**
- Modify: `src/panel/App.tsx`
- Modify: `src/panel/styles.css`

- [ ] **Step 1: Add measured dashboard components**

Add helpers:
- `formatHwpxUnit(value: number): string`
- `formatMarginSet(margins): string`
- `renderFormatProfile(profile)`
- `renderPipelineModes()`

Show:
- page size and margins
- style counts: paragraph/character/border fill/text slots
- title table/body table counts
- first title table cell margin/size
- first five role styles with font face, size, char spacing, line spacing/indent when available
- rule-only vs Codex-assisted labels, both using the same deterministic style profile

- [ ] **Step 2: Keep UI dense and operational**

No landing-page copy. Use compact cards, tables, and labels. Keep existing file upload/source/generation flow.

- [ ] **Step 3: Build**

Run: `npm run build`

Expected: PASS.

---

### Task 5: Real Sample Analyzer Artifacts

**Files:**
- Temporary script only, deleted after execution.
- Output: `/Users/hyeon/Desktop/hwp-result/template-profile-sample*.json`

- [ ] **Step 1: Generate analyzer JSON for the three provided BRIEF samples**

Use a temporary `vite-node` script to write:
- `template-profile-sample1.json`
- `template-profile-sample2.json`
- `template-profile-sample3.json`

Each JSON must include page margins, style counts, first title table profile, and first 20 text slots.

- [ ] **Step 2: Inspect invariants**

Print a summary:
- page margins found or missing
- character style count
- paragraph style count
- table/cell count
- title table first cell margin
- sample title text slot style IDs

- [ ] **Step 3: Delete the temporary script**

Use `apply_patch` to remove the script.

---

### Task 6: Verification And Handoff

**Files:**
- Modify: `README.md`
- Modify: `HANDOFF.md`

- [ ] **Step 1: Update docs**

Document:
- deterministic format analyzer is the source of truth
- rule-only and LLM-assisted versions share the same analyzer
- LLM never guesses font/margin/spacing values

- [ ] **Step 2: Run final verification**

Run:

```bash
npm test
npm run build
git diff --check
```

Expected: all pass.

- [ ] **Step 3: Confirm local services**

Check:
- Vite on `localhost:5173`
- helper on `127.0.0.1:8765`

Restart helper if needed after code changes.

---

## Self-Review

- This plan corrects the earlier image-first drift by making deterministic format extraction the foundation.
- It does not claim perfect visual output yet. The commercial-quality gate is now measurable: if the profile cannot explain the sample's margins, paragraph styles, character styles, tables, cells, and slots, generation is not allowed to be considered high fidelity.
- LLM and no-LLM versions are separated at the matcher layer only. Low-level HWPX style data is always parsed from XML.

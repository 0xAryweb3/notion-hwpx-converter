# HWPX Hancom-Safe Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make generated HWPX files more stable when opened in Hancom by adding deterministic reflow-risk reporting and more conservative layout pagination.

**Architecture:** Keep the current HWPX XML pipeline. Add report-level Hancom risk counters in `generationReport`, add visual proxy checks for short wrapped tails and table/paragraph crowding in `visualDogfood`, then tighten renderer page-bottom reserves in `render`. No new output formats or Hancom automation are introduced.

**Tech Stack:** TypeScript, Vitest, fflate, existing HWPX XML parsing/rendering helpers.

## Global Constraints

- The product remains HWPX-only.
- Do not add binary `.hwp`, PDF, DOCX, export presets, or a generic document-conversion layer.
- Do not depend on Hancom UI automation, screenshots, OCR, or AppleScript.
- Do not introduce LLM formatting guesses.
- Keep deterministic HWPX/XML checks as the source of truth.

---

## File Structure

- Modify: `src/features/hwpx/generationReport.ts`
  - Owns generated-report aggregation and CLI summary fields.
- Modify: `src/features/hwpx/visualDogfood.ts`
  - Owns deterministic visual proxy analysis and SVG preview summaries.
- Modify: `src/features/hwpx/render.ts`
  - Owns generated HWPX layout positions, page breaks, table reserve space, and source image placement.
- Modify: `src/test/generate-local.test.ts`
  - Regression coverage for report/console Hancom risk count.
- Modify: `src/test/hwpx-visual-dogfood.test.ts`
  - Regression coverage for short wrapped tails and table/paragraph crowding.
- Modify: `src/test/hwpx-render.test.ts`
  - Regression coverage for more conservative page-bottom reserves.
- Optional Modify: `README.md`
  - Mention the new Hancom reflow risk count in local generation reports if the final CLI JSON shape changes.

---

### Task 1: Report Hancom Reflow Risk Count

**Files:**
- Modify: `src/features/hwpx/generationReport.ts`
- Modify: `src/test/generate-local.test.ts`

**Interfaces:**
- Consumes: `GeneratedOutputAudit`, `VisualDogfoodReport`
- Produces: `GeneratedHwpxReport.hancomReflowRiskCount: number`
- Produces: `GeneratedHwpxConsoleSummary.hancomReflowRiskCount: number`
- Produces: `countHancomReflowRisks(outputAudit: GeneratedOutputAudit, visualDogfood: VisualDogfoodReport): number`

- [ ] **Step 1: Write the failing test**

Append this assertion to the existing `generateHwpxReport` test in `src/test/generate-local.test.ts`:

```ts
expect(result.report.hancomReflowRiskCount).toBe(0);
expect(result.consoleSummary.hancomReflowRiskCount).toBe(0);
```

Update the import at the top of `src/test/generate-local.test.ts`:

```ts
import { buildGeneratedHwpxConsoleSummary, generateHwpxReport } from "../features/hwpx/generationReport";
```

Add a direct unit test in the same file:

```ts
it("counts deterministic Hancom reflow risks in the generated report summary", () => {
  const report = buildGeneratedHwpxConsoleSummary({
    generatedAt: "2026-06-17T00:00:00.000Z",
    samplePath: "/tmp/sample.hwpx",
    outputPath: "/tmp/output.hwpx",
    hancomReflowRiskCount: 3,
    source: { blockCount: 1, tableRowCount: 0, imageCount: 0 },
    template: {
      paragraphCount: 1,
      tableCount: 0,
      titleTableCount: 0,
      bodyTableCount: 0,
      grammarWarnings: [],
      tableMotifs: [],
      roles: {}
    },
    quality: {
      inputTableGroupCount: 0,
      inputTableRowCount: 0,
      structureTableAssignmentCount: 0,
      issues: [],
      assignmentRows: []
    },
    outputAudit: {
      score: 100,
      passed: true,
      summary: {
        sourceBlocks: 1,
        sourceTableGroups: 0,
        outputParagraphs: 1,
        outputTables: 0,
        outputTitleTables: 0,
        outputBodyTables: 0,
        outputPictures: 0,
        outputContainers: 0,
        outputLineSegArrays: 1,
        outputLineSegs: 1,
        redRunCount: 0,
        nonBlackGeneratedRunCount: 0,
        badBulletIndentCount: 0,
        badNonBulletIndentCount: 0,
        badBulletStyleIndentCount: 0,
        badNonBulletAutoHeadingCount: 0,
        missingSourceTextCount: 0,
        overflowRiskCount: 0,
        pageOverflowCount: 0
      },
      issues: []
    },
    visualDogfood: {
      paragraphs: [],
      tables: [],
      issues: [],
      summary: {
        paragraphs: 0,
        nonEmptyParagraphs: 0,
        tables: 0,
        nonEmptyTables: 0,
        nonBlackGeneratedTextCount: 0,
        bulletNegativeIndentStyleCount: 0,
        bulletContinuationIndentRiskCount: 0,
        justifySpacingRiskCount: 0,
        missingBlankAfterBulletGroupCount: 0,
        verticalOverlapRiskCount: 0,
        pageOverflowRiskCount: 0,
        pageBottomTightRiskCount: 0,
        pageCount: 1,
        pageContentHeight: 10000
      }
    }
  });

  expect(report.hancomReflowRiskCount).toBe(3);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/test/generate-local.test.ts`

Expected: FAIL because `hancomReflowRiskCount` does not exist on `GeneratedHwpxReport` or `GeneratedHwpxConsoleSummary`.

- [ ] **Step 3: Implement the report field**

In `src/features/hwpx/generationReport.ts`, add `hancomReflowRiskCount` to both interfaces:

```ts
export interface GeneratedHwpxReport {
  generatedAt: string;
  samplePath: string;
  outputPath: string;
  hancomReflowRiskCount: number;
  source: {
    url?: string;
    blockCount: number;
    tableRowCount: number;
    imageCount: number;
  };
  template: {
    paragraphCount: number;
    tableCount: number;
    titleTableCount: number;
    bodyTableCount: number;
    grammarWarnings: string[];
    tableMotifs: HwpxTemplate["formatGrammar"]["tableMotifs"];
    roles: Record<string, GeneratedHwpxRoleReport | null>;
  };
  quality: GenerationQualityReport;
  outputAudit: GeneratedOutputAudit;
  visualDogfood: VisualDogfoodReport;
}
```

```ts
export interface GeneratedHwpxConsoleSummary {
  outputPath: string;
  reportPath?: string;
  blocks: number;
  score: number;
  passed: boolean;
  errors: number;
  warnings: number;
  visualErrors: number;
  visualWarnings: number;
  hancomReflowRiskCount: number;
  outputTables: number;
  outputBodyTables: number;
  lineSegArrays: number;
  badBulletIndentCount: number;
  badNonBulletIndentCount: number;
  badBulletStyleIndentCount: number;
  badNonBulletAutoHeadingCount: number;
  missingSourceTextCount: number;
}
```

After computing `outputAudit` and `visualDogfood`, set the report field:

```ts
const hancomReflowRiskCount = countHancomReflowRisks(outputAudit, visualDogfood);
const report: GeneratedHwpxReport = {
  generatedAt: new Date().toISOString(),
  samplePath: options.samplePath,
  outputPath: options.outputPath,
  hancomReflowRiskCount,
  source: {
    url: options.sourceUrl,
    blockCount: options.blocks.length,
    tableRowCount: options.blocks.filter((block) => block.role === "tableRow").length,
    imageCount: options.blocks.filter((block) => block.role === "image").length
  },
  template: {
    paragraphCount: options.template.analysis.paragraphCount,
    tableCount: options.template.analysis.tableCount,
    titleTableCount: options.template.analysis.leadingTitleTableCount,
    bodyTableCount: options.template.analysis.bodyTableCount,
    grammarWarnings: options.template.formatGrammar.warnings,
    tableMotifs: options.template.formatGrammar.tableMotifs,
    roles: Object.fromEntries(Object.entries(options.template.formatGrammar.roles).map(([role, value]) => [
      role,
      value === undefined
        ? null
        : {
            sampleText: value.sampleText,
            style: value.style,
            fontSizePt: value.fontSizePt,
            charSpacing: value.charSpacing,
            indent: value.paragraphMargins.intent,
            reason: value.reason
          }
    ]))
  },
  quality: analyzeGenerationQuality(options.template, options.blocks),
  outputAudit,
  visualDogfood
};
```

Add this helper near `buildGeneratedHwpxConsoleSummary`:

```ts
export function countHancomReflowRisks(
  outputAudit: GeneratedOutputAudit,
  visualDogfood: VisualDogfoodReport
): number {
  const auditRiskCodes = new Set([
    "paragraph-overflow-risk",
    "page-line-overflow"
  ]);
  const visualRiskCodes = new Set([
    "page-overflow-risk",
    "page-bottom-tight-risk",
    "vertical-overlap-risk",
    "missing-blank-after-bullet-group",
    "bullet-continuation-indent-risk",
    "justify-spacing-risk",
    "short-wrapped-tail-risk",
    "table-paragraph-gap-risk"
  ]);

  return outputAudit.issues.filter((issue) => auditRiskCodes.has(issue.code)).length +
    visualDogfood.issues.filter((issue) => visualRiskCodes.has(issue.code)).length;
}
```

Add the console field in `buildGeneratedHwpxConsoleSummary`:

```ts
hancomReflowRiskCount: report.hancomReflowRiskCount,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/test/generate-local.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add src/features/hwpx/generationReport.ts src/test/generate-local.test.ts
git diff --cached --check
git commit -m "[feat] report hancom reflow risks"
```

---

### Task 2: Add Visual Dogfood Risk Detectors

**Files:**
- Modify: `src/features/hwpx/visualDogfood.ts`
- Modify: `src/test/hwpx-visual-dogfood.test.ts`
- Modify: `src/test/generate-local.test.ts`

**Interfaces:**
- Consumes: `VisualDogfoodParagraph[]`, `VisualDogfoodTable[]`
- Produces: `VisualDogfoodReport.summary.shortWrappedTailRiskCount: number`
- Produces: `VisualDogfoodReport.summary.tableParagraphGapRiskCount: number`
- Produces warning issue code `short-wrapped-tail-risk`
- Produces warning issue code `table-paragraph-gap-risk`

- [ ] **Step 1: Write failing tests**

Add tests to `src/test/hwpx-visual-dogfood.test.ts`:

```ts
it("warns when a wrapped paragraph ends with a very short tail line", () => {
  const report = analyzeHwpxVisualDogfood(createHeader(), `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<hs:sec xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section">
  <hp:p id="tail-risk" paraPrIDRef="1" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">
    <hp:run charPrIDRef="1"><hp:t>울산시는 탄소중립 정책 실행 기반을 넓히기 위한 세부 계획을 발표</hp:t></hp:run>
    <hp:linesegarray>
        <hp:lineseg textpos="0" vertpos="0" vertsize="1000" textheight="1000" baseline="850" spacing="600" horzpos="0" horzsize="42520" flags="393216"/>
        <hp:lineseg textpos="31" vertpos="1600" vertsize="1000" textheight="1000" baseline="850" spacing="600" horzpos="0" horzsize="42520" flags="1441792"/>
    </hp:linesegarray>
  </hp:p>
</hs:sec>`);

  expect(report.summary.shortWrappedTailRiskCount).toBe(1);
  expect(report.issues).toContainEqual(expect.objectContaining({
    severity: "warning",
    code: "short-wrapped-tail-risk"
  }));
});
```

```ts
it("warns when a generated table is too close to the following top-level paragraph", () => {
  const report = analyzeHwpxVisualDogfood(createHeader(), `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<hs:sec xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section">
  <hp:tbl id="body-table"><hp:sz width="42520" height="2400"/><hp:tr><hp:tc><hp:cellSz width="42520" height="2400"/><hp:subList><hp:p id="table-p" paraPrIDRef="1" styleIDRef="0"><hp:run charPrIDRef="1"><hp:t>울산 소식</hp:t></hp:run></hp:p></hp:subList></hp:tc></hp:tr></hp:tbl>
  ${paragraph("after-table", "1", "1", "다음 문단", 2600)}
</hs:sec>`);

  expect(report.summary.tableParagraphGapRiskCount).toBe(1);
  expect(report.issues).toContainEqual(expect.objectContaining({
    severity: "warning",
    code: "table-paragraph-gap-risk"
  }));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/test/hwpx-visual-dogfood.test.ts`

Expected: FAIL because the summary fields and issue codes do not exist.

- [ ] **Step 3: Implement visual summary fields**

In `src/features/hwpx/visualDogfood.ts`, add to `VisualDogfoodReport.summary`:

```ts
shortWrappedTailRiskCount: number;
tableParagraphGapRiskCount: number;
```

In `analyzeHwpxVisualDogfood`, add:

```ts
shortWrappedTailRiskCount: issues.filter((issue) => issue.code === "short-wrapped-tail-risk").length,
tableParagraphGapRiskCount: issues.filter((issue) => issue.code === "table-paragraph-gap-risk").length,
```

- [ ] **Step 4: Implement short-tail detection**

Add constants near `pageBottomHeadroomWarningThreshold`:

```ts
const minimumFinalWrappedLineChars = 9;
const minimumTableParagraphGap = 1200;
```

Inside `collectIssues`, after the existing paragraph-level loop that checks color/bullets/justify, add:

```ts
    if (paragraph.lines.length > 1) {
      const lastLine = paragraph.lines.at(-1);
      const lastTextPos = lastLine?.textPos ?? text.length;
      const tailLength = Math.max(0, text.length - lastTextPos);

      if (tailLength > 0 && tailLength < minimumFinalWrappedLineChars) {
        issues.push({
          severity: "warning",
          code: "short-wrapped-tail-risk",
          message: "A wrapped generated paragraph ends with a very short final line, which often looks like an accidental line break in Hancom.",
          paragraphIndex: paragraph.index,
          text,
          detail: { tailLength, minimumFinalWrappedLineChars }
        });
      }
    }
```

- [ ] **Step 5: Implement table/paragraph gap detection**

Add this helper below `readPageBottoms`:

```ts
function findNextTopLevelParagraphAfterTable(
  table: VisualDogfoodTable,
  paragraphs: VisualDogfoodParagraph[]
): VisualDogfoodParagraph | undefined {
  return paragraphs
    .filter((paragraph) =>
      paragraph.topLevel &&
      !paragraph.insideTable &&
      paragraph.pageIndex === table.pageIndex &&
      paragraph.text.trim().length > 0 &&
      paragraph.lines.length > 0 &&
      (paragraph.lines[0]?.vertPos ?? 0) >= table.bottom
    )
    .sort((left, right) => (left.lines[0]?.vertPos ?? 0) - (right.lines[0]?.vertPos ?? 0))[0];
}
```

Inside `collectIssues`, before `return issues`, add:

```ts
  for (const table of tables.filter((item) => item.text.trim().length > 0)) {
    const nextParagraph = findNextTopLevelParagraphAfterTable(table, paragraphs);

    if (nextParagraph === undefined) {
      continue;
    }

    const nextTop = nextParagraph.lines[0]?.vertPos ?? table.bottom;
    const gap = nextTop - table.bottom;

    if (gap >= 0 && gap < minimumTableParagraphGap) {
      issues.push({
        severity: "warning",
        code: "table-paragraph-gap-risk",
        message: "A table is too close to the following paragraph, so Hancom reflow may make the page look crowded or overlapping.",
        paragraphIndex: nextParagraph.index,
        text: nextParagraph.text.trim(),
        detail: { tableIndex: table.index, gap, minimumTableParagraphGap, pageIndex: table.pageIndex }
      });
    }
  }
```

- [ ] **Step 6: Run targeted tests**

Run: `npm test -- src/test/hwpx-visual-dogfood.test.ts src/test/generate-local.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
git add src/features/hwpx/visualDogfood.ts src/test/hwpx-visual-dogfood.test.ts src/test/generate-local.test.ts
git diff --cached --check
git commit -m "[feat] detect hancom layout risks"
```

---

### Task 3: Make HWPX Rendering More Conservative By Default

**Files:**
- Modify: `src/features/hwpx/render.ts`
- Modify: `src/test/hwpx-render.test.ts`

**Interfaces:**
- Consumes: existing `generateHwpx(template, blocks, options?)`
- Produces: same public API with safer default pagination
- Internal constants:
  - `pageBottomHeadroomReserve = 4000`
  - `sourceImageBottomHeadroomReserve = 4000`

- [ ] **Step 1: Write failing renderer tests**

Add a test in `src/test/hwpx-render.test.ts` near the page-bottom tests:

```ts
it("starts generated content on a new page when it would leave less than Hancom-safe headroom", () => {
  const template = loadHwpxTemplate(createPaginationTemplateZip());
  const output = unzipSync(
    generateHwpx(
      template,
      Array.from({ length: 4 }, (_, index) => ({
        id: `block-${index + 1}`,
        role: "body" as const,
        text: `본문 ${index + 1}`
      }))
    )
  );
  const fourthParagraph = paragraphXmlByText(sectionXmlFromOutput(output), "본문 4");

  expect(fourthParagraph).toContain('pageBreak="1"');
  expect(firstLineVertPos(fourthParagraph)).toBeLessThanOrEqual(2000);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/test/hwpx-render.test.ts`

Expected: FAIL because the current reserve is `2000hu`, so the second paragraph may stay on the same page.

- [ ] **Step 3: Tighten renderer reserves**

In `src/features/hwpx/render.ts`, replace:

```ts
const pageBottomHeadroomReserve = 2000;
```

with:

```ts
const pageBottomHeadroomReserve = 4000;
const sourceImageBottomHeadroomReserve = 4000;
```

In `appendSourceImageParagraphs`, replace:

```ts
if (currentBottom > 0 && vertPos + imageBlockHeight > pageContentHeight) {
```

with:

```ts
if (currentBottom > 0 && vertPos + imageBlockHeight > pageContentHeight - sourceImageBottomHeadroomReserve) {
```

Keep the existing paragraph and table new-page checks, because they already use `pageBottomHeadroomReserve`.

- [ ] **Step 4: Run renderer tests**

Run: `npm test -- src/test/hwpx-render.test.ts`

Expected: PASS. The existing 5-paragraph page-bottom test should continue to pass, and the new 4-paragraph test should now pass because the reserve is intentionally more conservative.

- [ ] **Step 5: Commit**

Run:

```bash
git add src/features/hwpx/render.ts src/test/hwpx-render.test.ts
git diff --cached --check
git commit -m "[fix] reserve safer hwpx layout headroom"
```

---

### Task 4: Full Verification And Documentation

**Files:**
- Modify: `README.md` only if the generated CLI JSON now needs user-facing explanation.
- Modify: `HANDOFF.md` only at the end of a long session or if pausing before completion.

**Interfaces:**
- Consumes: all previous tasks
- Produces: verified HWPX-only Hancom-safe layout improvements

- [ ] **Step 1: Run focused tests**

Run:

```bash
npm test -- src/test/hwpx-render.test.ts src/test/hwpx-visual-dogfood.test.ts src/test/hwpx-output-audit.test.ts src/test/generate-local.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run full tests**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 3: Run build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 4: Check whitespace**

Run:

```bash
git diff --check
```

Expected: no output.

- [ ] **Step 5: Optional smoke generation**

If sample files are still available locally, run one current BRIEF smoke check:

```bash
node_modules/.bin/vite-node helper/generate-local.ts \
  --sample "/Users/hyeon/Desktop/hwp-result/current-7-8.hwpx" \
  --source-text "탄소중립 정보공유
전국 소식
- 울산시는 탄소중립 정책 실행 기반을 넓히기 위한 세부 계획을 발표했다." \
  --output "/tmp/hwpx-hancom-safe-smoke.hwpx" \
  --report "/tmp/hwpx-hancom-safe-smoke.json"
```

Expected: console JSON includes `"hancomReflowRiskCount": 0` or a small explicit warning count with matching visual issue details in the report.

- [ ] **Step 6: Commit docs if changed**

If README or HANDOFF changed, run:

```bash
git add README.md HANDOFF.md
git diff --cached --check
git commit -m "[docs] document hancom safe hwpx checks"
```

Skip this commit when no docs changed.

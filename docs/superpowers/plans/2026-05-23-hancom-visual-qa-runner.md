# Hancom Visual QA Runner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a repeatable local QA runner that generates HWPX outputs, JSON reports, SVG previews, and an aggregate summary for multiple samples.

**Architecture:** Extract the current `helper/generate-local.ts` report-building logic into a reusable module, add a pure QA summary module, then build a CLI wrapper that loops over samples and writes artifacts. Keep Hancom opening optional and manual-review friendly so the feature works even when macOS automation permissions are incomplete.

**Tech Stack:** TypeScript, Vite Node helper scripts, Vitest, fflate, existing HWPX generation/audit modules.

---

### File Structure

- Create: `src/features/hwpx/generationReport.ts`
  - Builds one generated HWPX plus the JSON report and console summary from a loaded template and source blocks.
- Create: `src/features/hwpx/qaRun.ts`
  - Parses sample specs, aggregates generated reports, computes pass/fail gates, and renders Markdown summary text.
- Create: `src/test/hwpx-qa-run.test.ts`
  - Covers sample parsing, summary pass/fail gates, and Markdown content.
- Modify: `helper/generate-local.ts`
  - Replace duplicated report-building logic with `generateHwpxReport()`.
- Create: `helper/qa-run.ts`
  - CLI entrypoint for multi-sample generation and artifact writing.
- Modify: `README.md`
  - Document the QA runner command.
- Modify: `HANDOFF.md`
  - Record the new workflow and verification result.

### Task 1: Pure QA Summary Module

**Files:**
- Create: `src/features/hwpx/qaRun.ts`
- Test: `src/test/hwpx-qa-run.test.ts`

- [ ] **Step 1: Write failing tests for sample parsing and summary gates**

```ts
import { describe, expect, it } from "vitest";
import {
  buildQaRunSummary,
  parseQaSampleSpec,
  renderQaRunMarkdown
} from "../features/hwpx/qaRun";

describe("HWPX QA run", () => {
  it("parses label-prefixed sample specs without touching Korean paths", () => {
    expect(parseQaSampleSpec("7-8::/Users/hyeon/Downloads/★2025년 7-8월 브리프.hwpx")).toEqual({
      label: "7-8",
      path: "/Users/hyeon/Downloads/★2025년 7-8월 브리프.hwpx"
    });
  });

  it("rejects malformed sample specs", () => {
    expect(() => parseQaSampleSpec("/tmp/sample.hwpx")).toThrow("--sample must use label::path");
  });

  it("fails the run when any generated report has visual warnings", () => {
    const summary = buildQaRunSummary({
      generatedAt: "2026-05-23T00:00:00.000Z",
      source: { url: "https://example.notion.site/page", blockCount: 2 },
      artifactsDir: "/tmp/hwp-qa",
      samples: [
        {
          label: "clean",
          samplePath: "/tmp/clean.hwpx",
          outputPath: "/tmp/hwp-qa/clean.hwpx",
          reportPath: "/tmp/hwp-qa/clean.json",
          svgPath: "/tmp/hwp-qa/clean.svg",
          outputAudit: { passed: true, errors: 0, warnings: 0 },
          visualDogfood: { errors: 0, warnings: 1, pageCount: 2, pageOverflowRiskCount: 0, pageBottomTightRiskCount: 1 },
          counts: {
            outputTables: 2,
            outputBodyTables: 0,
            missingSourceTextCount: 0,
            badBulletIndentCount: 0,
            badNonBulletIndentCount: 0,
            badBulletStyleIndentCount: 0,
            badNonBulletAutoHeadingCount: 0
          }
        }
      ]
    });

    expect(summary.passed).toBe(false);
    expect(summary.totals.visualWarnings).toBe(1);
    expect(summary.samples[0]?.passed).toBe(false);
  });

  it("renders a Markdown summary with artifact paths and key counts", () => {
    const summary = buildQaRunSummary({
      generatedAt: "2026-05-23T00:00:00.000Z",
      source: { text: "본문", blockCount: 1 },
      artifactsDir: "/tmp/hwp-qa",
      samples: [
        {
          label: "sample-a",
          samplePath: "/tmp/sample-a.hwpx",
          outputPath: "/tmp/hwp-qa/sample-a.hwpx",
          reportPath: "/tmp/hwp-qa/sample-a.json",
          svgPath: "/tmp/hwp-qa/sample-a.svg",
          outputAudit: { passed: true, errors: 0, warnings: 0 },
          visualDogfood: { errors: 0, warnings: 0, pageCount: 2, pageOverflowRiskCount: 0, pageBottomTightRiskCount: 0 },
          counts: {
            outputTables: 2,
            outputBodyTables: 0,
            missingSourceTextCount: 0,
            badBulletIndentCount: 0,
            badNonBulletIndentCount: 0,
            badBulletStyleIndentCount: 0,
            badNonBulletAutoHeadingCount: 0
          }
        }
      ]
    });

    const markdown = renderQaRunMarkdown(summary);

    expect(markdown).toContain("# HWPX QA Run");
    expect(markdown).toContain("sample-a");
    expect(markdown).toContain("/tmp/hwp-qa/sample-a.hwpx");
    expect(markdown).toContain("pageBottomTightRiskCount");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/test/hwpx-qa-run.test.ts`

Expected: FAIL because `src/features/hwpx/qaRun.ts` does not exist.

- [ ] **Step 3: Implement the pure QA module**

Create `src/features/hwpx/qaRun.ts` with:

```ts
export interface QaSampleSpec {
  label: string;
  path: string;
}

export interface QaRunInput {
  generatedAt: string;
  source: { url?: string; text?: string; blockCount: number };
  artifactsDir: string;
  samples: QaSampleInput[];
}

export interface QaSampleInput {
  label: string;
  samplePath: string;
  outputPath: string;
  reportPath: string;
  svgPath: string;
  outputAudit: { passed: boolean; errors: number; warnings: number };
  visualDogfood: {
    errors: number;
    warnings: number;
    pageCount: number;
    pageOverflowRiskCount: number;
    pageBottomTightRiskCount: number;
  };
  counts: {
    outputTables: number;
    outputBodyTables: number;
    missingSourceTextCount: number;
    badBulletIndentCount: number;
    badNonBulletIndentCount: number;
    badBulletStyleIndentCount: number;
    badNonBulletAutoHeadingCount: number;
  };
}

export interface QaRunSummary extends QaRunInput {
  passed: boolean;
  totals: {
    samples: number;
    failedSamples: number;
    outputErrors: number;
    outputWarnings: number;
    visualErrors: number;
    visualWarnings: number;
    missingSourceTextCount: number;
  };
  samples: Array<QaSampleInput & { passed: boolean; failureReasons: string[] }>;
}

export function parseQaSampleSpec(value: string): QaSampleSpec {
  const separatorIndex = value.indexOf("::");

  if (separatorIndex <= 0 || separatorIndex === value.length - 2) {
    throw new Error("--sample must use label::path");
  }

  return {
    label: value.slice(0, separatorIndex),
    path: value.slice(separatorIndex + 2)
  };
}

export function buildQaRunSummary(input: QaRunInput): QaRunSummary {
  const samples = input.samples.map((sample) => {
    const failureReasons = sampleFailureReasons(sample);

    return {
      ...sample,
      passed: failureReasons.length === 0,
      failureReasons
    };
  });
  const totals = {
    samples: samples.length,
    failedSamples: samples.filter((sample) => !sample.passed).length,
    outputErrors: sum(samples, (sample) => sample.outputAudit.errors),
    outputWarnings: sum(samples, (sample) => sample.outputAudit.warnings),
    visualErrors: sum(samples, (sample) => sample.visualDogfood.errors),
    visualWarnings: sum(samples, (sample) => sample.visualDogfood.warnings),
    missingSourceTextCount: sum(samples, (sample) => sample.counts.missingSourceTextCount)
  };

  return {
    ...input,
    samples,
    totals,
    passed: totals.failedSamples === 0
  };
}

export function renderQaRunMarkdown(summary: QaRunSummary): string {
  const sourceLabel = summary.source.url ?? "source text";
  const rows = summary.samples.map((sample) =>
    `| ${sample.label} | ${sample.passed ? "PASS" : "FAIL"} | ${sample.outputAudit.errors}/${sample.outputAudit.warnings} | ${sample.visualDogfood.errors}/${sample.visualDogfood.warnings} | ${sample.visualDogfood.pageCount} | ${sample.counts.outputTables} | ${sample.counts.missingSourceTextCount} | ${sample.outputPath} | ${sample.svgPath} |`
  ).join("\n");
  const failures = summary.samples
    .filter((sample) => sample.failureReasons.length > 0)
    .flatMap((sample) => sample.failureReasons.map((reason) => `- ${sample.label}: ${reason}`))
    .join("\n");

  return [
    "# HWPX QA Run",
    "",
    `- Generated at: ${summary.generatedAt}`,
    `- Source: ${sourceLabel}`,
    `- Source blocks: ${summary.source.blockCount}`,
    `- Artifacts: ${summary.artifactsDir}`,
    `- Result: ${summary.passed ? "PASS" : "FAIL"}`,
    "",
    "| Sample | Result | Output errors/warnings | Visual errors/warnings | Pages | Tables | Missing source | HWPX | SVG |",
    "| --- | --- | --- | --- | ---: | ---: | ---: | --- | --- |",
    rows,
    "",
    "## Gate Counts",
    "",
    `- pageOverflowRiskCount: ${sum(summary.samples, (sample) => sample.visualDogfood.pageOverflowRiskCount)}`,
    `- pageBottomTightRiskCount: ${sum(summary.samples, (sample) => sample.visualDogfood.pageBottomTightRiskCount)}`,
    `- badBulletIndentCount: ${sum(summary.samples, (sample) => sample.counts.badBulletIndentCount)}`,
    `- badNonBulletIndentCount: ${sum(summary.samples, (sample) => sample.counts.badNonBulletIndentCount)}`,
    `- badBulletStyleIndentCount: ${sum(summary.samples, (sample) => sample.counts.badBulletStyleIndentCount)}`,
    `- badNonBulletAutoHeadingCount: ${sum(summary.samples, (sample) => sample.counts.badNonBulletAutoHeadingCount)}`,
    "",
    "## Failures",
    "",
    failures.length === 0 ? "- None" : failures
  ].join("\n");
}

function sampleFailureReasons(sample: QaSampleInput): string[] {
  const reasons: string[] = [];

  if (!sample.outputAudit.passed) reasons.push("output audit did not pass");
  if (sample.outputAudit.errors > 0) reasons.push(`output audit has ${sample.outputAudit.errors} errors`);
  if (sample.outputAudit.warnings > 0) reasons.push(`output audit has ${sample.outputAudit.warnings} warnings`);
  if (sample.visualDogfood.errors > 0) reasons.push(`visual dogfood has ${sample.visualDogfood.errors} errors`);
  if (sample.visualDogfood.warnings > 0) reasons.push(`visual dogfood has ${sample.visualDogfood.warnings} warnings`);
  if (sample.counts.missingSourceTextCount > 0) reasons.push(`missing source text count is ${sample.counts.missingSourceTextCount}`);
  if (sample.counts.badBulletIndentCount > 0) reasons.push(`bad bullet indent count is ${sample.counts.badBulletIndentCount}`);
  if (sample.counts.badNonBulletIndentCount > 0) reasons.push(`bad non-bullet indent count is ${sample.counts.badNonBulletIndentCount}`);
  if (sample.counts.badBulletStyleIndentCount > 0) reasons.push(`bad bullet style indent count is ${sample.counts.badBulletStyleIndentCount}`);
  if (sample.counts.badNonBulletAutoHeadingCount > 0) reasons.push(`bad non-bullet auto heading count is ${sample.counts.badNonBulletAutoHeadingCount}`);
  if (sample.visualDogfood.pageOverflowRiskCount > 0) reasons.push(`page overflow risk count is ${sample.visualDogfood.pageOverflowRiskCount}`);
  if (sample.visualDogfood.pageBottomTightRiskCount > 0) reasons.push(`page bottom tight risk count is ${sample.visualDogfood.pageBottomTightRiskCount}`);

  return reasons;
}

function sum<T>(items: T[], read: (item: T) => number): number {
  return items.reduce((total, item) => total + read(item), 0);
}
```

- [ ] **Step 4: Run focused test**

Run: `npm test -- src/test/hwpx-qa-run.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/hwpx/qaRun.ts src/test/hwpx-qa-run.test.ts
git commit -m "[feat] add hwpx qa summary model"
```

### Task 2: Shared Generation Report Module

**Files:**
- Create: `src/features/hwpx/generationReport.ts`
- Modify: `helper/generate-local.ts`
- Test: `src/test/generate-local.test.ts`

- [ ] **Step 1: Add a test that uses the shared report builder**

Extend `src/test/generate-local.test.ts` with a small synthetic template and blocks. Expected assertions:

```ts
expect(result.report.outputAudit.passed).toBe(true);
expect(result.consoleSummary.score).toBe(100);
expect(result.report.visualDogfood.summary.pageOverflowRiskCount).toBe(0);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/test/generate-local.test.ts`

Expected: FAIL because `generateHwpxReport()` does not exist.

- [ ] **Step 3: Create `src/features/hwpx/generationReport.ts`**

Move the report-building logic from `helper/generate-local.ts` into:

```ts
export interface GenerateHwpxReportOptions {
  template: HwpxTemplate;
  blocks: DocumentBlock[];
  samplePath: string;
  outputPath: string;
  sourceUrl?: string;
}

export function generateHwpxReport(options: GenerateHwpxReportOptions): {
  output: Uint8Array;
  report: GeneratedHwpxReport;
  consoleSummary: GeneratedHwpxConsoleSummary;
}
```

The function must keep the current report keys: `generatedAt`, `samplePath`, `outputPath`, `source`, `template`, `quality`, `outputAudit`, and `visualDogfood`.

- [ ] **Step 4: Update `helper/generate-local.ts`**

Replace inline generation/audit/report construction with `generateHwpxReport()`. Keep CLI behavior and console output shape unchanged.

- [ ] **Step 5: Run focused tests**

Run: `npm test -- src/test/generate-local.test.ts src/test/hwpx-output-audit.test.ts src/test/hwpx-visual-dogfood.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/hwpx/generationReport.ts helper/generate-local.ts src/test/generate-local.test.ts
git commit -m "[refactor] share hwpx generation reports"
```

### Task 3: Multi-Sample QA Runner CLI

**Files:**
- Create: `helper/qa-run.ts`
- Modify: `README.md`
- Test: `src/test/hwpx-qa-run.test.ts`

- [ ] **Step 1: Add CLI parsing tests**

Add tests for:

```ts
expect(parseQaRunArgs([
  "--source-text", "본문",
  "--output-dir", "/tmp/hwp-qa",
  "--sample", "a::/tmp/a.hwpx",
  "--sample", "b::/tmp/b.hwpx"
]).samples).toHaveLength(2);
```

and:

```ts
expect(() => parseQaRunArgs(["--output-dir", "/tmp/hwp-qa"])).toThrow("--source-url or --source-text is required");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/test/hwpx-qa-run.test.ts`

Expected: FAIL because `parseQaRunArgs()` does not exist.

- [ ] **Step 3: Implement CLI argument parsing in `src/features/hwpx/qaRun.ts`**

Export `parseQaRunArgs(args: string[])` with support for:

- `--source-url <url>`
- `--source-text <text>`
- `--output-dir <path>`
- repeated `--sample <label::path>`
- optional `--open-hancom`

Reject missing source, missing output dir, and zero samples with explicit errors.

- [ ] **Step 4: Create `helper/qa-run.ts`**

The CLI should:

1. Parse args.
2. Read source blocks using the same logic as `helper/generate-local.ts`.
3. For each sample, call `generateHwpxReport()`.
4. Write:
   - `<output-dir>/<label>.hwpx`
   - `<output-dir>/<label>.json`
   - `<output-dir>/<label>.svg`
5. Build summary with `buildQaRunSummary()`.
6. Write:
   - `<output-dir>/qa-summary.json`
   - `<output-dir>/qa-summary.md`
7. Print a compact JSON summary.
8. If `--open-hancom` is present, call `open -a "Hancom Office HWP Viewer" <outputPath>` for each output.

- [ ] **Step 5: Document the command in README**

Add a "Batch QA" section with the `helper/qa-run.ts` command and explain the output files.

- [ ] **Step 6: Run focused tests**

Run: `npm test -- src/test/hwpx-qa-run.test.ts src/test/generate-local.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add helper/qa-run.ts README.md src/features/hwpx/qaRun.ts src/test/hwpx-qa-run.test.ts
git commit -m "[feat] add hwpx qa runner cli"
```

### Task 4: Real BRIEF QA Run And Documentation

**Files:**
- Modify: `HANDOFF.md`
- External artifacts: `/Users/hyeon/Desktop/hwp-result/qa-current/*`

- [ ] **Step 1: Run full verification**

Run:

```bash
npm test
npm run build
git diff --check
```

Expected: all pass.

- [ ] **Step 2: Run QA runner on the three current BRIEF samples**

Run:

```bash
node_modules/.bin/vite-node helper/qa-run.ts \
  --source-url "https://galvanized-need-1fa.notion.site/BRIEF-9-2026-5-34f1e6afd42e8029a30bd4cb4b0523d6" \
  --output-dir "/Users/hyeon/Desktop/hwp-result/qa-current" \
  --sample "7-8::/Users/hyeon/Downloads/★2025년 7-8월 브리프(통권 제6호) 탄소중립 정보공유 통합본_250826_1730.hwpx" \
  --sample "9-10::/Users/hyeon/Downloads/★2025년 9-10월 브리프(통권 제7호)_251017 1455.hwpx" \
  --sample "6-7::/Users/hyeon/Downloads/2025년 6-7월 브리프(통권 제5호)_250716_1440.hwpx"
```

Expected: console JSON shows `"passed": true`, and `/Users/hyeon/Desktop/hwp-result/qa-current/qa-summary.md` lists all three samples as PASS.

- [ ] **Step 3: Update HANDOFF**

Record:

- Plan path
- Commits made
- Verification commands and results
- QA artifact directory
- Remaining limitation: Hancom page navigation is still manual unless macOS automation permission works.

- [ ] **Step 4: Final commit**

```bash
git add HANDOFF.md
git commit -m "[docs] record hwpx qa runner verification"
```

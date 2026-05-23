import { describe, expect, it } from "vitest";
import {
  buildQaRunSummary,
  parseQaRunArgs,
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

  it("parses repeated QA runner sample arguments", () => {
    expect(parseQaRunArgs([
      "--source-text", "본문",
      "--output-dir", "/tmp/hwp-qa",
      "--sample", "a::/tmp/a.hwpx",
      "--sample", "b::/tmp/b.hwpx"
    ])).toEqual({
      sourceText: "본문",
      outputDir: "/tmp/hwp-qa",
      samples: [
        { label: "a", path: "/tmp/a.hwpx" },
        { label: "b", path: "/tmp/b.hwpx" }
      ],
      openHancom: false
    });
  });

  it("rejects QA runner arguments without source input", () => {
    expect(() => parseQaRunArgs([
      "--output-dir", "/tmp/hwp-qa",
      "--sample", "a::/tmp/a.hwpx"
    ])).toThrow("--source-url or --source-text is required");
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
          visualDogfood: {
            errors: 0,
            warnings: 1,
            pageCount: 2,
            pageOverflowRiskCount: 0,
            pageBottomTightRiskCount: 1
          },
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
          visualDogfood: {
            errors: 0,
            warnings: 0,
            pageCount: 2,
            pageOverflowRiskCount: 0,
            pageBottomTightRiskCount: 0
          },
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

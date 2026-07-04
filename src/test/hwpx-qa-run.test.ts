import { describe, expect, it } from "vitest";
import {
  buildQaRunSummary,
  parseQaRunArgs,
  parseQaSampleSpec,
  renderHancomReviewMarkdown,
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

  it("parses source-file QA runner arguments for archived source text", () => {
    expect(parseQaRunArgs([
      "--source-file", "/tmp/brief-source.txt",
      "--output-dir", "/tmp/hwp-qa",
      "--sample", "a::/tmp/a.hwpx"
    ])).toEqual({
      sourceFile: "/tmp/brief-source.txt",
      outputDir: "/tmp/hwp-qa",
      samples: [
        { label: "a", path: "/tmp/a.hwpx" }
      ],
      openHancom: false
    });
  });

  it("rejects QA runner arguments without source input", () => {
    expect(() => parseQaRunArgs([
      "--output-dir", "/tmp/hwp-qa",
      "--sample", "a::/tmp/a.hwpx"
    ])).toThrow("--source-url, --source-text, or --source-file is required");
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
      source: { file: "/tmp/brief-source.txt", blockCount: 1 },
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
    expect(markdown).toContain("- Source: /tmp/brief-source.txt");
    expect(markdown).toContain("/tmp/hwp-qa/sample-a.hwpx");
    expect(markdown).toContain("pageBottomTightRiskCount");
    expect(markdown).toContain("hancom-review.md");
  });

  it("renders a Hancom manual review packet with editable evidence fields", () => {
    const summary = buildQaRunSummary({
      generatedAt: "2026-06-10T00:00:00.000Z",
      source: { file: "/tmp/brief-source.txt", blockCount: 3 },
      artifactsDir: "/tmp/hwp-qa",
      samples: [
        {
          label: "7-8",
          samplePath: "/tmp/sample-7-8.hwpx",
          outputPath: "/tmp/hwp-qa/7-8.hwpx",
          reportPath: "/tmp/hwp-qa/7-8.json",
          svgPath: "/tmp/hwp-qa/7-8.svg",
          outputAudit: { passed: true, errors: 0, warnings: 0 },
          visualDogfood: {
            errors: 0,
            warnings: 0,
            pageCount: 2,
            pageOverflowRiskCount: 0,
            pageBottomTightRiskCount: 0
          },
          counts: {
            outputTables: 8,
            outputBodyTables: 6,
            missingSourceTextCount: 0,
            badBulletIndentCount: 0,
            badNonBulletIndentCount: 0,
            badBulletStyleIndentCount: 0,
            badNonBulletAutoHeadingCount: 0
          }
        }
      ]
    });

    const markdown = renderHancomReviewMarkdown(summary);

    expect(markdown).toContain("# Hancom Manual Review");
    expect(markdown).toContain("- Source: /tmp/brief-source.txt");
    expect(markdown).toContain("/tmp/hwp-qa/7-8.hwpx");
    expect(markdown).toContain("/tmp/hwp-qa/7-8.json");
    expect(markdown).toContain("/tmp/hwp-qa/7-8.svg");
    expect(markdown).toContain("Expected proxy pages");
    expect(markdown).toContain("Hancom page count");
    expect(markdown).toContain("Later pages status");
    expect(markdown).toContain("Screenshot path");
    expect(markdown).toContain("Inspect every page after page 1");
    expect(markdown).toContain("## Page Evidence Checklist");
    expect(markdown).toContain("| 7-8 | 1 | page 1 |");
    expect(markdown).toContain("| 7-8 | 2 | later page |");
    expect(markdown).toContain("/tmp/hwp-qa/screenshots/7-8-page-2.png");
    expect(markdown).toContain("Record one row per Hancom-rendered page");
  });
});

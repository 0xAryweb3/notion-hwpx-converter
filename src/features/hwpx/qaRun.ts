export interface QaSampleSpec {
  label: string;
  path: string;
}

export interface QaRunCliOptions {
  sourceUrl?: string;
  sourceText?: string;
  outputDir: string;
  samples: QaSampleSpec[];
  openHancom: boolean;
}

export interface QaRunInput {
  generatedAt: string;
  source: {
    url?: string;
    text?: string;
    blockCount: number;
  };
  artifactsDir: string;
  samples: QaSampleInput[];
}

export interface QaSampleInput {
  label: string;
  samplePath: string;
  outputPath: string;
  reportPath: string;
  svgPath: string;
  outputAudit: {
    passed: boolean;
    errors: number;
    warnings: number;
  };
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

export interface QaRunSummary extends Omit<QaRunInput, "samples"> {
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
  samples: QaSampleSummary[];
}

export interface QaSampleSummary extends QaSampleInput {
  passed: boolean;
  failureReasons: string[];
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

export function parseQaRunArgs(args: string[]): QaRunCliOptions {
  let sourceUrl: string | undefined;
  let sourceText: string | undefined;
  let outputDir: string | undefined;
  let openHancom = false;
  const samples: QaSampleSpec[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];

    if (key === "--open-hancom") {
      openHancom = true;
      continue;
    }

    if (key === undefined || !key.startsWith("--")) {
      throw new Error("Usage: vite-node helper/qa-run.ts --source-url <url> --output-dir <dir> --sample <label::sample.hwpx>");
    }

    const value = args[index + 1];

    if (value === undefined) {
      throw new Error(`${key} requires a value`);
    }

    switch (key) {
      case "--source-url":
        sourceUrl = value;
        break;
      case "--source-text":
        sourceText = value;
        break;
      case "--output-dir":
        outputDir = value;
        break;
      case "--sample":
        samples.push(parseQaSampleSpec(value));
        break;
      default:
        throw new Error(`Unknown argument: ${key}`);
    }

    index += 1;
  }

  if (sourceUrl === undefined && sourceText === undefined) {
    throw new Error("--source-url or --source-text is required");
  }

  if (outputDir === undefined) {
    throw new Error("--output-dir is required");
  }

  if (samples.length === 0) {
    throw new Error("at least one --sample is required");
  }

  return {
    sourceUrl,
    sourceText,
    outputDir,
    samples,
    openHancom
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

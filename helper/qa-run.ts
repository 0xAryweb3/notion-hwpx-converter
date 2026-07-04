import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { normalizeLinesToBlocks } from "../src/features/document/detect";
import type { DocumentBlock } from "../src/features/document/types";
import { generateHwpxReport } from "../src/features/hwpx/generationReport";
import {
  buildQaRunSummary,
  parseQaRunArgs,
  renderHancomReviewMarkdown,
  renderQaRunMarkdown
} from "../src/features/hwpx/qaRun";
import type { QaSampleInput } from "../src/features/hwpx/qaRun";
import { loadHwpxTemplate } from "../src/features/hwpx/template";
import { renderVisualDogfoodSvg } from "../src/features/hwpx/visualDogfood";
import { publicNotionBlocksToDocumentBlocks } from "../src/features/notion-link/publicBlocks";
import { cleanNotionLine } from "../src/features/notion-text/clean";
// helper scripts are intentionally JS-compatible so the dev server and CLI share the same Notion reader.
// @ts-expect-error no local declaration file for this helper module
import { fetchPublicNotionPageText } from "./notion-public.mjs";

const execFileAsync = promisify(execFile);

async function main(): Promise<void> {
  const options = parseQaRunArgs(process.argv.slice(2));
  const blocks = await readSourceBlocks(options);
  const generatedAt = new Date().toISOString();

  await mkdir(options.outputDir, { recursive: true });

  const samples: QaSampleInput[] = [];

  for (const sample of options.samples) {
    const artifactName = safeArtifactName(sample.label);
    const outputPath = join(options.outputDir, `${artifactName}.hwpx`);
    const reportPath = join(options.outputDir, `${artifactName}.json`);
    const svgPath = join(options.outputDir, `${artifactName}.svg`);
    const template = loadHwpxTemplate(await readFile(sample.path));
    const result = generateHwpxReport({
      template,
      blocks,
      samplePath: sample.path,
      outputPath,
      sourceUrl: options.sourceUrl,
      sourceFile: options.sourceFile
    });
    const visualSvg = renderVisualDogfoodSvg(result.report.visualDogfood);

    await writeFile(outputPath, result.output);
    await writeFile(reportPath, `${JSON.stringify(result.report, null, 2)}\n`);
    await writeFile(svgPath, `${visualSvg}\n`);

    samples.push({
      label: sample.label,
      samplePath: sample.path,
      outputPath,
      reportPath,
      svgPath,
      outputAudit: {
        passed: result.report.outputAudit.passed,
        errors: result.report.outputAudit.issues.filter((issue) => issue.severity === "error").length,
        warnings: result.report.outputAudit.issues.filter((issue) => issue.severity === "warning").length
      },
      visualDogfood: {
        errors: result.report.visualDogfood.issues.filter((issue) => issue.severity === "error").length,
        warnings: result.report.visualDogfood.issues.filter((issue) => issue.severity === "warning").length,
        pageCount: result.report.visualDogfood.summary.pageCount,
        pageOverflowRiskCount: result.report.visualDogfood.summary.pageOverflowRiskCount,
        pageBottomTightRiskCount: result.report.visualDogfood.summary.pageBottomTightRiskCount
      },
      counts: {
        outputTables: result.report.outputAudit.summary.outputTables,
        outputBodyTables: result.report.outputAudit.summary.outputBodyTables,
        missingSourceTextCount: result.report.outputAudit.summary.missingSourceTextCount,
        badBulletIndentCount: result.report.outputAudit.summary.badBulletIndentCount,
        badNonBulletIndentCount: result.report.outputAudit.summary.badNonBulletIndentCount,
        badBulletStyleIndentCount: result.report.outputAudit.summary.badBulletStyleIndentCount,
        badNonBulletAutoHeadingCount: result.report.outputAudit.summary.badNonBulletAutoHeadingCount
      }
    });

    if (options.openHancom) {
      await openInHancom(outputPath);
    }
  }

  const summary = buildQaRunSummary({
    generatedAt,
    source: {
      url: options.sourceUrl,
      file: options.sourceFile,
      text: options.sourceText,
      blockCount: blocks.length
    },
    artifactsDir: options.outputDir,
    samples
  });

  await writeFile(join(options.outputDir, "qa-summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  await writeFile(join(options.outputDir, "qa-summary.md"), `${renderQaRunMarkdown(summary)}\n`);
  const hancomReviewPath = join(options.outputDir, "hancom-review.md");
  await writeFile(hancomReviewPath, `${renderHancomReviewMarkdown(summary)}\n`);

  console.log(JSON.stringify({
    outputDir: options.outputDir,
    passed: summary.passed,
    samples: summary.totals.samples,
    failedSamples: summary.totals.failedSamples,
    outputErrors: summary.totals.outputErrors,
    outputWarnings: summary.totals.outputWarnings,
    visualErrors: summary.totals.visualErrors,
    visualWarnings: summary.totals.visualWarnings,
    missingSourceTextCount: summary.totals.missingSourceTextCount,
    summaryPath: join(options.outputDir, "qa-summary.md"),
    hancomReviewPath
  }, null, 2));
}

async function readSourceBlocks(options: { sourceUrl?: string; sourceText?: string; sourceFile?: string }): Promise<DocumentBlock[]> {
  if (options.sourceUrl !== undefined) {
    const result = await fetchPublicNotionPageText(options.sourceUrl);

    return Array.isArray(result.blocks)
      ? publicNotionBlocksToDocumentBlocks(result.blocks)
      : normalizeLinesToBlocks(result.text.split(/\r?\n/u).map((line: string) => cleanNotionLine(line)));
  }

  const sourceText = options.sourceFile === undefined ? (options.sourceText ?? "") : await readFile(options.sourceFile, "utf8");

  return normalizeLinesToBlocks(sourceText.split(/\r?\n/u).map((line) => cleanNotionLine(line)));
}

function safeArtifactName(label: string): string {
  return label.replace(/[^A-Za-z0-9._-]+/g, "_");
}

async function openInHancom(outputPath: string): Promise<void> {
  await execFileAsync("open", ["-a", "Hancom Office HWP Viewer", outputPath]);
}

function isCliEntrypoint(): boolean {
  if (process.env.VITEST === "true") {
    return false;
  }

  const directEntry = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
  const viteNodeEntry = process.argv.some((arg) => arg.endsWith("helper/qa-run.ts"));

  return directEntry || viteNodeEntry || import.meta.url.endsWith("/helper/qa-run.ts");
}

if (isCliEntrypoint()) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

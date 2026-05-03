import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { strFromU8, unzipSync } from "fflate";
import { normalizeLinesToBlocks } from "../src/features/document/detect";
import type { DocumentBlock } from "../src/features/document/types";
import { applyLayoutSafety } from "../src/features/hwpx/layoutSafety";
import { auditGeneratedHwpx } from "../src/features/hwpx/outputAudit";
import { analyzeGenerationQuality } from "../src/features/hwpx/quality";
import { generateHwpx } from "../src/features/hwpx/render";
import { loadHwpxTemplate } from "../src/features/hwpx/template";
import { buildHwpxSourceStructure } from "../src/features/hwpx/sourceStructure";
import { assignHwpxStyles } from "../src/features/hwpx/styleAssignment";
import { analyzeHwpxVisualDogfood } from "../src/features/hwpx/visualDogfood";
import { publicNotionBlocksToDocumentBlocks } from "../src/features/notion-link/publicBlocks";
import { cleanNotionLine } from "../src/features/notion-text/clean";
// helper scripts are intentionally JS so the dev server and CLI share the same Notion reader.
// @ts-expect-error no local declaration file for this helper module
import { fetchPublicNotionPageText } from "./notion-public.mjs";

interface CliOptions {
  samplePath: string;
  outputPath: string;
  reportPath: string;
  sourceUrl?: string;
  sourceText?: string;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const template = loadHwpxTemplate(await readFile(options.samplePath));
  const blocks = await readSourceBlocks(options);
  const output = generateHwpx(template, blocks, { mode: "auto" });
  const outputFiles = unzipSync(output);
  const sectionXml = strFromU8(outputFiles["Contents/section0.xml"]);
  const headerXml = strFromU8(outputFiles["Contents/header.xml"]);
  const assignments = applyLayoutSafety(
    assignHwpxStyles(template.formatGrammar, buildHwpxSourceStructure(blocks), template.styleMap)
  );
  const outputAudit = auditGeneratedHwpx({
    blocks,
    assignments,
    sectionXml,
    headerXml,
    titleTableCount: template.analysis.leadingTitleTableCount
  });
  const visualDogfood = analyzeHwpxVisualDogfood(headerXml, sectionXml);
  const report = {
    generatedAt: new Date().toISOString(),
    samplePath: options.samplePath,
    outputPath: options.outputPath,
    source: {
      url: options.sourceUrl,
      blockCount: blocks.length,
      tableRowCount: blocks.filter((block) => block.role === "tableRow").length,
      imageCount: blocks.filter((block) => block.role === "image").length
    },
    template: {
      paragraphCount: template.analysis.paragraphCount,
      tableCount: template.analysis.tableCount,
      titleTableCount: template.analysis.leadingTitleTableCount,
      bodyTableCount: template.analysis.bodyTableCount,
      grammarWarnings: template.formatGrammar.warnings,
      tableMotifs: template.formatGrammar.tableMotifs,
      roles: Object.fromEntries(Object.entries(template.formatGrammar.roles).map(([role, value]) => [
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
    quality: analyzeGenerationQuality(template, blocks),
    outputAudit,
    visualDogfood
  };

  await mkdir(dirname(options.outputPath), { recursive: true });
  await mkdir(dirname(options.reportPath), { recursive: true });
  await writeFile(options.outputPath, output);
  await writeFile(options.reportPath, `${JSON.stringify(report, null, 2)}\n`);

  console.log(JSON.stringify({
    outputPath: options.outputPath,
    reportPath: options.reportPath,
    blocks: blocks.length,
    score: outputAudit.score,
    passed: outputAudit.passed,
    errors: outputAudit.issues.filter((issue) => issue.severity === "error").length,
    warnings: outputAudit.issues.filter((issue) => issue.severity === "warning").length,
    visualErrors: visualDogfood.issues.filter((issue) => issue.severity === "error").length,
    visualWarnings: visualDogfood.issues.filter((issue) => issue.severity === "warning").length,
    outputTables: outputAudit.summary.outputTables,
    outputBodyTables: outputAudit.summary.outputBodyTables,
    lineSegArrays: outputAudit.summary.outputLineSegArrays,
    badBulletIndentCount: outputAudit.summary.badBulletIndentCount,
    badNonBulletIndentCount: outputAudit.summary.badNonBulletIndentCount,
    badBulletStyleIndentCount: outputAudit.summary.badBulletStyleIndentCount,
    missingSourceTextCount: outputAudit.summary.missingSourceTextCount
  }, null, 2));
}

function parseArgs(args: string[]): CliOptions {
  const values = new Map<string, string>();

  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];

    if (key === undefined || value === undefined || !key.startsWith("--")) {
      throw new Error("Usage: vite-node helper/generate-local.ts --sample <sample.hwpx> --source-url <url> --output <out.hwpx> --report <report.json>");
    }

    values.set(key.slice(2), value);
  }

  const samplePath = values.get("sample");
  const outputPath = values.get("output");
  const reportPath = values.get("report") ?? outputPath?.replace(/\.hwpx$/u, ".json");
  const sourceUrl = values.get("source-url");
  const sourceText = values.get("source-text");

  if (samplePath === undefined || outputPath === undefined || reportPath === undefined) {
    throw new Error("--sample and --output are required.");
  }

  if (sourceUrl === undefined && sourceText === undefined) {
    throw new Error("--source-url or --source-text is required.");
  }

  return { samplePath, outputPath, reportPath, sourceUrl, sourceText };
}

async function readSourceBlocks(options: CliOptions): Promise<DocumentBlock[]> {
  if (options.sourceUrl !== undefined) {
    const result = await fetchPublicNotionPageText(options.sourceUrl);

    return Array.isArray(result.blocks)
      ? publicNotionBlocksToDocumentBlocks(result.blocks)
      : normalizeLinesToBlocks(result.text.split(/\r?\n/u).map((line: string) => cleanNotionLine(line)));
  }

  return normalizeLinesToBlocks((options.sourceText ?? "").split(/\r?\n/u).map((line) => cleanNotionLine(line)));
}

function isCliEntrypoint(): boolean {
  if (process.env.VITEST === "true") {
    return false;
  }

  const directEntry = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
  const viteNodeEntry = process.argv.some((arg) => arg.endsWith("helper/generate-local.ts"));

  return directEntry || viteNodeEntry || import.meta.url.endsWith("/helper/generate-local.ts");
}

if (isCliEntrypoint()) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

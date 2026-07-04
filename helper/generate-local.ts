import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { normalizeLinesToBlocks } from "../src/features/document/detect";
import type { DocumentBlock } from "../src/features/document/types";
import { buildGeneratedHwpxConsoleSummary, generateHwpxReport } from "../src/features/hwpx/generationReport";
import { loadHwpxTemplate } from "../src/features/hwpx/template";
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
  sourceFile?: string;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const template = loadHwpxTemplate(await readFile(options.samplePath));
  const blocks = await readSourceBlocks(options);
  const result = generateHwpxReport({
    template,
    blocks,
    samplePath: options.samplePath,
    outputPath: options.outputPath,
    sourceUrl: options.sourceUrl
  });

  await mkdir(dirname(options.outputPath), { recursive: true });
  await mkdir(dirname(options.reportPath), { recursive: true });
  await writeFile(options.outputPath, result.output);
  await writeFile(options.reportPath, `${JSON.stringify(result.report, null, 2)}\n`);

  console.log(JSON.stringify(buildGeneratedHwpxConsoleSummary(result.report, options.reportPath), null, 2));
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
  const sourceFile = values.get("source-file");

  if (samplePath === undefined || outputPath === undefined || reportPath === undefined) {
    throw new Error("--sample and --output are required.");
  }

  if (sourceUrl === undefined && sourceText === undefined && sourceFile === undefined) {
    throw new Error("--source-url, --source-text, or --source-file is required.");
  }

  return { samplePath, outputPath, reportPath, sourceUrl, sourceText, sourceFile };
}

async function readSourceBlocks(options: CliOptions): Promise<DocumentBlock[]> {
  if (options.sourceUrl !== undefined) {
    const result = await fetchPublicNotionPageText(options.sourceUrl);

    return Array.isArray(result.blocks)
      ? publicNotionBlocksToDocumentBlocks(result.blocks)
      : normalizeLinesToBlocks(result.text.split(/\r?\n/u).map((line: string) => cleanNotionLine(line)));
  }

  const sourceText = options.sourceFile === undefined ? (options.sourceText ?? "") : await readFile(options.sourceFile, "utf8");

  return normalizeLinesToBlocks(sourceText.split(/\r?\n/u).map((line) => cleanNotionLine(line)));
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
